"use client";

import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  FileDown,
  Info,
  ListPlus,
  Lock,
  Plus,
  Printer,
  RotateCcw,
  Send,
  Store,
  TriangleAlert,
  Truck,
  X,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DocumentHeader } from "@/components/ui/document-header";
import { Drawer } from "@/components/ui/drawer";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/selection-controls";
import { ErrorState, Skeleton } from "@/components/ui/system-states";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { can } from "@/features/auth/can";
import { ensureCsrf, useMe } from "@/features/auth/session";
import { formatIsoDate, parseUzDate } from "@/features/counterparties/api";
import { DeactivateDialog } from "@/features/organization/deactivate-dialog";
import { useWarehouses } from "@/features/organization/api";
import { searchProducts } from "@/features/prices/api";
import { describeError } from "@/features/setup/form-error";
import { api, unwrap } from "@/lib/api/client";
import { formatMoney, formatQuantity } from "@/lib/format";
import {
  APPROVE_BRANCH,
  APPROVE_DIRECTOR,
  ORDER_CANCEL,
  ORDER_CANCEL_PICK,
  ORDER_CREATE,
  ORDER_MANAGE,
  canApprove,
  canCancelOrder,
  defaultPaymentType,
  loadOrder,
  searchCustomers,
  useApproveOrder,
  useCancelOrder,
  useOrder,
  useRejectOrder,
  useReturnOrder,
  useSaveOrder,
  useSubmitOrder,
  type OrderDetail,
  type OrderIssue,
  type OrderRequest,
  codesExportUrl,
} from "./api";
import { CatalogDialog } from "./catalog-dialog";
import { OrderCardAside, OrderCardBody, OrderStepper } from "./order-card";
import { CustomerStateRow, RecentOrders, useCustomerCredit, type PreviousOrder } from "./customer-state";
import { clearOpenDraft, draftFormFor, readOpenDraft, writeOpenDraft } from "./open-draft";
import { OrderStatusBadge, day } from "./orders-page";

const PAYMENT_VALUES = ["TRANSFER", "CASH", "ONLINE"] as const;

type Frame = "drawer" | "page";

/**
 * Buyurtma hujjati toʻliq SAHIFA sifatida (prototip `OrderEntry` / `OrderCard`): `/orders/new`, `/orders/[id]`.
 * Yopish — roʻyxatga qaytish; yangi buyurtma saqlanganda manzil `/orders/<id>` ga almashadi.
 */
export function OrderDocumentPage({ id, preset }: { id: number | null; preset?: { customerId: number; customerLabel: string } }) {
  const router = useRouter();
  return (
    <OrderDrawer
      frame="page"
      id={id}
      preset={preset}
      onClose={() => (clearOpenDraft(), router.push("/orders"))}
      onCreated={(newId) => router.replace(`/orders/${newId}`)}
    />
  );
}

/** preset — yangi buyurtmada oldindan tanlangan mijoz (masalan, bosh sahifadagi «Mijoz holati»dan). */
export function OrderDrawer(props: {
  id: number | null;
  onClose: () => void;
  onCreated: (id: number) => void;
  preset?: { customerId: number; customerLabel: string };
  frame?: Frame;
}) {
  const t = useTranslations("orders");
  const tc = useTranslations("common");
  const doc = useOrder(props.id);
  if (props.frame === "page" && props.id !== null && (doc.error || !doc.data))
    return (
      <div className="flex flex-col gap-4">
        <DocumentHeader
          parent={{ label: t("page.parent"), href: "/orders" }}
          crumb={doc.error ? t("page.title") : tc("loading")}
          title={t("page.title")}
        />
        {doc.error ? <ErrorState onRetry={() => doc.refetch()} /> : <Skeleton className="h-40 w-full" />}
      </div>
    );
  if (props.id !== null && doc.error)
    return (
      <Drawer open onClose={props.onClose} size="lg" kind={t("drawer.kind")} title="BY">
        <ErrorState onRetry={() => doc.refetch()} />
      </Drawer>
    );
  if (props.id !== null && !doc.data)
    return (
      <Drawer open onClose={props.onClose} size="lg" kind={t("drawer.kind")} title={tc("loading")}>
        <Skeleton className="h-40 w-full" />
      </Drawer>
    );
  const d = doc.data ?? null;
  return <Editor key={d ? `${d.id}-${d.status}` : "new"} doc={d} {...props} />;
}

interface DraftLine {
  productId: number;
  productCode: string;
  productName: string;
  qty: string;
}

const isInt = (s: string) => /^\d+$/.test(s.trim());

/** Toshkent boʻyicha bugun (+ kun), ISO `YYYY-MM-DD`. */
function tashkentDay(plusDays: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(new Date(Date.now() + plusDays * 86_400_000));
}

/** Yopishda ogohlantirish: tahrirlanadigan hujjatda saqlanmagan qatorlar bor (yangi qoralama — qator qoʻshilgan boʻlsa). */
export function hasUnsavedChanges(s: { editable: boolean; isNew: boolean; dirty: boolean; lineCount: number }): boolean {
  return s.editable && (s.isNew ? s.lineCount > 0 : s.dirty);
}

function Editor({
  doc,
  onClose,
  onCreated,
  preset,
  frame = "drawer",
}: {
  doc: OrderDetail | null;
  onClose: () => void;
  onCreated: (id: number) => void;
  preset?: { customerId: number; customerLabel: string };
  frame?: Frame;
}) {
  const t = useTranslations("orders");
  const me = useMe();
  const warehouses = useWarehouses();
  const save = useSaveOrder();
  const submit = useSubmitOrder();
  const approve = useApproveOrder();
  const back = useReturnOrder();
  const reject = useRejectOrder();
  const cancel = useCancelOrder();
  const editable = can(me.data, ORDER_CREATE) && (!doc || doc.status === "DRAFT");
  // Ochiq hujjat (SPEC 208): boshqa sahifadan qaytganda saqlanmagan forma tiklanadi
  const [restored] = useState(() => (editable ? draftFormFor(readOpenDraft(), doc?.id ?? null) : null));
  const [warehouseId, setWarehouseId] = useState<string | null>(restored ? restored.warehouseId : doc ? String(doc.warehouseId) : null);
  const [customer, setCustomer] = useState<string | null>(
    restored ? restored.customer : doc ? String(doc.customerId) : preset ? String(preset.customerId) : null,
  );
  const [customerLabel, setCustomerLabel] = useState(restored?.customerLabel ?? doc?.customer ?? preset?.customerLabel ?? "");
  const [deliveryType, setDeliveryType] = useState<string | null>(restored ? restored.deliveryType : (doc?.deliveryType ?? "DELIVERY"));
  // Yangi buyurtmada yetkazish sanasi — ertaga (prototip), Toshkent vaqti
  const [deliveryDate, setDeliveryDate] = useState(
    () => restored?.deliveryDate ?? (doc ? formatIsoDate(doc.deliveryDate) : formatIsoDate(tashkentDay(1))),
  );
  const [address, setAddress] = useState(restored?.address ?? doc?.address ?? "");
  const [paymentType, setPaymentType] = useState<string | null>(restored ? restored.paymentType : (doc?.paymentType ?? "TRANSFER"));
  const [note, setNote] = useState(restored?.note ?? doc?.note ?? "");
  // Buyurtma sanasi — server qoʻyadi (yaratilgan kun, Toshkent vaqti); yangi buyurtmada bugun
  const [orderDate] = useState(() => formatIsoDate(doc?.orderDate ?? tashkentDay(0)));
  const [lines, setLines] = useState<DraftLine[]>(
    restored
      ? restored.lines
      : doc
        ? doc.lines.map((l) => ({ productId: l.productId, productCode: l.productCode, productName: l.productName, qty: String(l.qty) }))
        : [],
  );
  const [adding, setAdding] = useState<{ product: string | null; qty: string }>({ product: null, qty: "" });
  const [local, setLocal] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"catalog" | "reject" | "cancel" | "discard" | null>(null);
  const seen = useRef(new Map<string, { code: string; name: string }>());
  const credit = useCustomerCredit(warehouseId ? Number(warehouseId) : null, editable && customer ? Number(customer) : null);
  const err = describeError(save.error ?? submit.error ?? approve.error ?? back.error);

  const activeWarehouses = (warehouses.data ?? []).filter((w) => w.active || String(w.id) === warehouseId);
  // Yagona faol ombor — yangi buyurtmada avtomatik tanlanadi (prototip)
  const onlyWarehouse = editable && !doc && activeWarehouses.length === 1 ? String(activeWarehouses[0].id) : null;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- omborlar yuklangach bir marta
    if (onlyWarehouse && warehouseId === null) setWarehouseId(onlyWarehouse);
  }, [onlyWarehouse, warehouseId]);
  const isApprover = canApprove(doc?.approvalLevel ?? null, can(me.data, APPROVE_BRANCH), can(me.data, APPROVE_DIRECTOR));
  const own = doc ? doc.createdById === me.data?.id : true;
  const cancellable =
    doc !== null &&
    canCancelOrder(doc.status, {
      own,
      cancel: can(me.data, ORDER_CANCEL),
      manage: can(me.data, ORDER_MANAGE),
      cancelPick: can(me.data, ORDER_CANCEL_PICK),
    });
  const serverLine = (productId: number) => doc?.lines.find((l) => l.productId === productId);
  const dirty =
    doc !== null &&
    (lines.length !== doc.lines.length ||
      lines.some((l, i) => l.productId !== doc.lines[i]?.productId || Number(l.qty) !== doc.lines[i]?.qty));
  const unsaved = hasUnsavedChanges({ editable, isNew: doc === null, dirty, lineCount: lines.length });
  // Saqlanmagan qatorlar bilan sahifani yopish / yangilash — brauzer ogohlantiradi (SPEC 6)
  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);
  const requestClose = () => (unsaved ? setDialog("discard") : onClose());
  // Sahifada Esc — roʻyxatga qaytish (ochiq oyna yoki roʻyxat tanlovi boʻlmasa; saqlanmagan boʻlsa soʻraydi)
  const requestCloseRef = useRef(requestClose);
  useEffect(() => {
    requestCloseRef.current = requestClose;
  });
  useEffect(() => {
    if (frame !== "page" || dialog) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector("dialog[open], [role='listbox']")) return;
      requestCloseRef.current();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [frame, dialog]);
  // Qoralama ochiq turibdi — sahifadan chiqib qaytganda shu holatda ochiladi (yopilganda roʻyxat sahifasi tozalaydi)
  const docId = doc?.id ?? null;
  useEffect(() => {
    const form = unsaved ? { warehouseId, customer, customerLabel, deliveryType, deliveryDate, address, paymentType, note, lines } : null;
    // Faqat tahrirlanadigan qoralama eslab qolinadi; jarayondagi hujjat — roʻyxatdan qayta ochiladi
    if (!editable || (docId === null && !form)) clearOpenDraft();
    else writeOpenDraft({ id: docId, form });
  }, [editable, docId, unsaved, warehouseId, customer, customerLabel, deliveryType, deliveryDate, address, paymentType, note, lines]);

  function body(): OrderRequest | null {
    if (!warehouseId) return (setLocal(t("drawer.errWarehouse")), null);
    if (!customer) return (setLocal(t("drawer.errCustomer")), null);
    const dd = parseUzDate(deliveryDate);
    if (dd === null) return (setLocal(t("drawer.errDate")), null);
    for (const [i, l] of lines.entries()) {
      if (!isInt(l.qty) || Number(l.qty) < 1) return (setLocal(t("drawer.errLineQty", { n: i + 1, name: l.productName })), null);
    }
    setLocal(null);
    return {
      warehouseId: Number(warehouseId),
      customerId: Number(customer),
      deliveryType: (deliveryType ?? "DELIVERY") as OrderRequest["deliveryType"],
      deliveryDate: dd,
      address: address.trim() || undefined,
      paymentType: (paymentType ?? "TRANSFER") as OrderRequest["paymentType"],
      note: note.trim() || undefined,
      lines: lines.map((l) => ({ productId: l.productId, qty: Number(l.qty) })),
    };
  }

  async function saveDraft(): Promise<OrderDetail | null> {
    const b = body();
    if (!b) return null;
    try {
      return await save.mutateAsync({ id: doc?.id, body: b });
    } catch {
      return null;
    }
  }

  // «Takrorlash» (prototip): oldingi buyurtma qatorlari joriy buyurtmaga qoʻshiladi; bor mahsulotlar oʻtkazib yuboriladi
  const [repeatNote, setRepeatNote] = useState<string | null>(null);
  const [repeating, setRepeating] = useState(false);
  async function repeatOrder(o: PreviousOrder) {
    setRepeating(true);
    try {
      const prev = await loadOrder(o.id);
      const have = new Set(lines.map((l) => l.productId));
      const add = prev.lines.filter((l) => !have.has(l.productId));
      const dup = prev.lines.filter((l) => have.has(l.productId)).map((l) => l.productName);
      setLines((ls) => [
        ...ls,
        ...add.map((l) => ({ productId: l.productId, productCode: l.productCode, productName: l.productName, qty: String(l.qty) })),
      ]);
      const parts = [t("customer.repeated", { number: o.number, count: add.length })];
      if (dup.length) parts.push(t("customer.repeatSkipped", { count: dup.length, names: dup.join(", ") }));
      const text = parts.join(". ");
      setRepeatNote(text);
      toast({ tone: "info", title: text, description: t("drawer.linesAddedHint") });
    } catch (e) {
      setLocal(describeError(e).message ?? t("repeat.loadError"));
    } finally {
      setRepeating(false);
    }
  }

  const issueCounts = {
    errors: doc?.issues.filter((i) => i.level === "ERROR").length ?? 0,
    warnings: doc?.issues.filter((i) => i.level !== "ERROR").length ?? 0,
  };
  const totalQty = lines.reduce((n, l) => n + (isInt(l.qty) ? Number(l.qty) : 0), 0);
  // «Mahsulot qoʻshish» (Alt+K) — katalog: narx va qoldiq mijoz shartiga bogʻliq, shuning uchun avval mijoz va ombor
  function openCatalog() {
    if (!customer) return toast({ tone: "warning", title: t("customer.needCustomer") });
    if (!warehouseId) return toast({ tone: "warning", title: t("drawer.errWarehouse") });
    setDialog("catalog");
  }
  // «Yuborish»: avval saqlanadi, keyin navbat yoki tasdiqqa yuboriladi
  function sendOrder() {
    if (save.isPending || submit.isPending) return;
    void saveDraft().then((d) => {
      if (!d) return;
      void submit.mutateAsync(d.id).then(
        (s) => {
          toast({
            tone: "success",
            title: s.status === "QUEUED" ? t("drawer.sentQueue") : t("drawer.sentApproval"),
            description: t("drawer.numberTotal", { number: s.number, amount: formatMoney(s.total) }),
          });
          if (!doc) onCreated(s.id);
        },
        () => {
          if (!doc) onCreated(d.id);
        },
      );
    });
  }
  const openCatalogRef = useRef(openCatalog);
  const sendOrderRef = useRef(sendOrder);
  useEffect(() => {
    openCatalogRef.current = openCatalog;
    sendOrderRef.current = sendOrder;
  });
  useEffect(() => {
    if (!editable) return;
    function onKey(e: KeyboardEvent) {
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === "KeyK") {
        e.preventDefault();
        openCatalogRef.current();
      }
      // Ctrl+Enter — saqlash va yuborish (prototip); ochiq oyna boʻlsa — yoʻq
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !document.querySelector("dialog[open]")) {
        e.preventDefault();
        sendOrderRef.current();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editable]);

  function addLine() {
    const label = adding.product ? seen.current.get(adding.product) : undefined;
    if (!adding.product || !label) return setLocal(t("drawer.errProduct"));
    if (!isInt(adding.qty) || Number(adding.qty) < 1) return setLocal(t("drawer.errQty"));
    const productId = Number(adding.product);
    if (lines.some((l) => l.productId === productId)) return setLocal(t("drawer.errDuplicate"));
    setLines((ls) => [...ls, { productId, productCode: label.code, productName: label.name, qty: adding.qty.trim() }]);
    setAdding({ product: null, qty: "" });
    setLocal(null);
  }

  const actions = (
    <>
      {cancellable ? (
        <Button
          variant="tertiary"
          icon={X}
          className={frame === "drawer" ? "mr-auto" : undefined}
          onClick={() => (cancel.reset(), setDialog("cancel"))}
        >
          {t("drawer.cancelOrder")}
        </Button>
      ) : null}
      {frame === "drawer" ? (
        <Button variant="secondary" onClick={requestClose}>
          {t("drawer.back")}
        </Button>
      ) : null}
      {editable ? (
        <>
          <Button
            variant="secondary"
            loading={save.isPending && !submit.isPending}
            onClick={() =>
              void saveDraft().then((d) => {
                if (!d) return;
                toast({ tone: "success", title: t("drawer.draftSaved"), description: d.number });
                if (!doc) onCreated(d.id);
              })
            }
          >
            {t("drawer.saveDraft")}
          </Button>
          <Button icon={Send} loading={submit.isPending} aria-keyshortcuts="Control+Enter" onClick={sendOrder}>
            {t("drawer.submit")}
            {frame === "page" ? (
              <kbd className="ml-1 rounded-sm bg-white/15 px-1.5 font-mono text-[11px] leading-4 font-normal">Ctrl+Enter</kbd>
            ) : null}
          </Button>
        </>
      ) : null}
      {doc?.status === "PENDING_APPROVAL" && (own || isApprover) ? (
        <Button
          variant="secondary"
          icon={RotateCcw}
          loading={back.isPending}
          onClick={() =>
            void back.mutateAsync(doc.id).then(
              () => toast({ tone: "success", title: t("drawer.returnedDraft") }),
              () => undefined,
            )
          }
        >
          {t("drawer.returnDraft")}
        </Button>
      ) : null}
      {doc?.status === "PENDING_APPROVAL" && isApprover ? (
        <>
          <Button variant="secondary" onClick={() => (reject.reset(), setDialog("reject"))}>
            {t("drawer.reject")}
          </Button>
          <Button
            icon={Check}
            loading={approve.isPending}
            onClick={() =>
              void approve.mutateAsync(doc.id).then(
                (d) => toast({ tone: "success", title: t("drawer.approved"), description: d.number }),
                () => undefined,
              )
            }
          >
            {t("drawer.approve")}
          </Button>
        </>
      ) : null}
    </>
  );

  const dialogs = (
    <>
      {dialog === "catalog" && warehouseId ? (
        <CatalogDialog
          warehouseId={Number(warehouseId)}
          customerId={customer ? Number(customer) : null}
          header={t("drawer.catalogHeader", {
            number: doc?.number ?? t("drawer.new"),
            customer: customerLabel || t("drawer.noCustomer"),
            warehouse: activeWarehouses.find((w) => String(w.id) === warehouseId)?.name ?? "",
            count: formatQuantity(lines.length),
          })}
          onClose={() => setDialog(null)}
          onAdd={(picked) => {
            setLines((ls) => {
              const next = [...ls];
              for (const p of picked) {
                const i = next.findIndex((x) => x.productId === p.productId);
                if (i >= 0) next[i] = { ...next[i], qty: String(Number(next[i].qty) + Number(p.qty)) };
                else next.push(p);
              }
              return next;
            });
            setDialog(null);
          }}
        />
      ) : null}
      {dialog === "discard" ? (
        <Modal
          open
          size="sm"
          tone="danger"
          title={t("drawer.discardTitle")}
          onClose={() => setDialog(null)}
          primaryAction={{ label: t("drawer.discardAction"), onClick: onClose }}
          secondaryAction={{ label: t("drawer.discardKeep"), onClick: () => setDialog(null) }}
        >
          <p>{t(doc ? "drawer.discardChanged" : "drawer.discardNew")}</p>
        </Modal>
      ) : null}
      {(dialog === "reject" || dialog === "cancel") && doc ? (
        <DeactivateDialog
          title={dialog === "reject" ? t("drawer.rejectTitle", { number: doc.number }) : t("drawer.cancelTitle", { number: doc.number })}
          consequence={dialog === "reject" ? t("drawer.rejectConsequence") : t("drawer.cancelConsequence")}
          actionLabel={dialog === "reject" ? t("drawer.rejectAction") : t("drawer.cancelOrder")}
          pending={dialog === "reject" ? reject.isPending : cancel.isPending}
          error={dialog === "reject" ? reject.error : cancel.error}
          onClose={() => setDialog(null)}
          onConfirm={(reason) =>
            void (dialog === "reject" ? reject : cancel).mutateAsync({ id: doc.id, reason }).then(
              () => (
                toast({
                  tone: "success",
                  title: dialog === "reject" ? t("drawer.rejected") : t("drawer.cancelled"),
                  description: doc.number,
                }),
                setDialog(null)
              ),
              () => undefined,
            )
          }
        />
      ) : null}
    </>
  );

  const content = (
    <>
      <div className="flex flex-col gap-4">
        <Decision doc={doc} />
        {doc && doc.status === "DRAFT" ? <IssuesPanel issues={doc.issues} dirty={dirty} /> : null}
        {doc && doc.status !== "DRAFT" ? <DocumentsRow doc={doc} /> : null}
        <section className="grid grid-cols-1 items-start gap-x-5 gap-y-4 rounded-card border border-border bg-surface px-6 py-5 shadow-sm md:grid-cols-3">
          <Select
            label={t("drawer.customer")}
            value={customer}
            loadOptions={async (q) => {
              const found = await searchCustomers(q);
              found.forEach((o) => seen.current.set(`c:${o.value}`, { code: o.sub, name: o.label }));
              return found;
            }}
            onChange={(v) => {
              setCustomer(v);
              setCustomerLabel(v ? (seen.current.get(`c:${v}`)?.name ?? "") : "");
              if (v && !doc)
                void defaultPaymentType(Number(v)).then(
                  (p) => setPaymentType(p),
                  () => undefined,
                );
            }}
            placeholder={customerLabel || t("entry.customerPh")}
            options={customer && customerLabel ? [{ value: customer, label: customerLabel }] : []}
            disabled={!editable}
            required
          />
          <TextField label={t("entry.orderDate")} value={orderDate} onChange={() => undefined} disabled />
          <Select
            label={t("entry.warehouse")}
            value={warehouseId}
            onChange={setWarehouseId}
            options={activeWarehouses.map((w) => ({ value: String(w.id), label: w.name }))}
            disabled={!editable}
            required
          />
          <div className="flex min-w-0 flex-col gap-1">
            <span id="by-delivery" className="font-medium text-text-secondary">
              {t("entry.deliveryType")}
              <span className="ml-0.5 text-danger" aria-hidden>
                *
              </span>
            </span>
            <div
              role="radiogroup"
              aria-labelledby="by-delivery"
              className="flex h-control-md gap-1 rounded-control border border-border bg-background p-0.5"
            >
              {(
                [
                  { value: "DELIVERY", label: t("list.delivery"), icon: Truck },
                  { value: "PICKUP", label: t("list.pickup"), icon: Store },
                ] as const
              ).map((o) => {
                const on = (deliveryType ?? "DELIVERY") === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={!editable}
                    onClick={() => setDeliveryType(o.value)}
                    className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-control px-1 text-caption transition-colors ${
                      on ? "bg-surface font-medium text-text-primary ring-1 ring-border" : "text-text-secondary hover:text-text-primary"
                    } disabled:cursor-default`}
                  >
                    <o.icon size={14} strokeWidth={1.5} aria-hidden className="hidden shrink-0 xl:block" />
                    <span className="truncate">{o.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <TextField
            label={t("drawer.deliveryDate")}
            value={deliveryDate}
            onChange={setDeliveryDate}
            placeholder={t("drawer.datePlaceholder")}
            disabled={!editable}
          />
          <Select
            label={t("drawer.paymentType")}
            value={paymentType}
            onChange={setPaymentType}
            options={PAYMENT_VALUES.map((v) => ({ value: v, label: t(`paymentType.${v}`) }))}
            disabled={!editable}
            required
            hint={
              !editable
                ? undefined
                : customer && credit.data
                  ? credit.data.paymentDays
                    ? t("customer.payAuto", { days: credit.data.paymentDays })
                    : t("customer.payAutoNoTerm")
                  : customer
                    ? undefined
                    : t("entry.payNone")
            }
          />
          {deliveryType !== "PICKUP" ? (
            <TextField
              label={t("drawer.address")}
              value={address}
              onChange={setAddress}
              disabled={!editable}
              hint={!doc ? t("drawer.addressHint") : undefined}
              className="md:col-span-3"
            />
          ) : null}
          <div className="flex min-w-0 flex-col gap-1 md:col-span-3">
            <label htmlFor="by-note" className="font-medium text-text-secondary">
              {t("drawer.note")}
            </label>
            <textarea
              id="by-note"
              rows={1}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={!editable}
              className="min-h-control-md resize-y rounded-control border border-border bg-surface px-3 py-2 text-body outline-none hover:border-text-disabled focus:border-primary focus:ring-3 focus:ring-primary/15 disabled:bg-background disabled:text-text-secondary"
            />
          </div>
        </section>

        {editable && customer && warehouseId && credit.data ? (
          <CustomerStateRow name={customerLabel} credit={credit.data} orderTotal={doc && !dirty ? doc.total : "0"} />
        ) : doc ? (
          <CreditRow doc={doc} />
        ) : null}
        {editable && customer ? (
          <RecentOrders customerId={Number(customer)} onRepeat={(o) => void repeatOrder(o)} note={repeatNote} busy={repeating} />
        ) : null}
        {doc?.status === "QUEUED" && can(me.data, "orders.queue") ? <TimeForm doc={doc} /> : null}
        {doc?.status === "CHECKING" && can(me.data, "orders.check") ? <CheckForm doc={doc} /> : null}

        {local ? <Alert tone="danger" title={local} /> : null}
        {err.message ? <Alert tone="danger" title={err.message} /> : null}

        <section aria-label={t("entry.lines")} className="rounded-card border border-border bg-surface shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3.5">
            <h3 className="flex items-baseline gap-2">
              <span className="font-semibold">{t("entry.lines")}</span>
              <span className="text-[13px] text-text-secondary tabular-nums">{formatQuantity(lines.length)}</span>
            </h3>
            <span className="flex flex-wrap items-center gap-4">
              {dirty ? <span className="text-caption text-text-secondary">{t("drawer.recalcHint")}</span> : null}
              {doc && !dirty && doc.status === "DRAFT" && issueCounts.errors > 0 ? (
                <span className="flex items-center gap-1 text-caption text-danger">
                  <CircleAlert size={14} strokeWidth={1.5} aria-hidden />
                  {t("customer.errNote", { count: issueCounts.errors })}
                </span>
              ) : null}
              {doc && !dirty && doc.status === "DRAFT" && issueCounts.warnings > 0 ? (
                <span className="flex items-center gap-1 text-caption text-warning">
                  <TriangleAlert size={14} strokeWidth={1.5} aria-hidden />
                  {t("customer.warnNote", { count: issueCounts.warnings })}
                </span>
              ) : null}
              {editable ? (
                <Button size="sm" icon={ListPlus} aria-keyshortcuts="Alt+K" onClick={openCatalog}>
                  {t("customer.pick")}
                  <span className="ml-1 text-[11px] font-normal opacity-80">Alt+K</span>
                </Button>
              ) : null}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-table">
              <thead className="bg-table-header text-left text-caption text-text-secondary">
                <tr>
                  <th className="w-10 px-3 py-2.5 font-medium">{t("entry.colNo")}</th>
                  <th className="px-3 py-2.5 font-medium">
                    {t("drawer.col.product")}
                    {editable ? <span className="ml-0.5 text-danger">*</span> : null}
                  </th>
                  <th className="px-3 py-2.5 text-right font-medium">{t("entry.colAvail")}</th>
                  <th className="px-3 py-2.5 text-right font-medium">
                    {t("drawer.col.qty")}
                    {editable ? <span className="ml-0.5 text-danger">*</span> : null}
                  </th>
                  <th className="px-3 py-2.5 text-right font-medium">{t("drawer.col.price")}</th>
                  <th className="px-3 py-2.5 text-right font-medium">{t("entry.colSum")}</th>
                  {editable ? <th className="w-10" /> : null}
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-7 text-center text-text-secondary">
                      {editable ? t("entry.noLines") : t("drawer.noLines")}
                    </td>
                  </tr>
                ) : (
                  lines.map((l, i) => {
                    const s = serverLine(l.productId);
                    const qty = Number(l.qty);
                    const over = s && isInt(l.qty) && qty > s.available;
                    const price = s ? (doc?.status === "DRAFT" ? s.currentPrice : s.price) : null;
                    return (
                      <tr key={l.productId} className="group border-t border-border hover:bg-background">
                        <td className="px-3 py-2 text-text-secondary tabular-nums">{i + 1}</td>
                        <td className="px-3 py-2">
                          <span className="font-medium">{l.productName}</span>
                          <span className="ml-2 font-mono text-caption text-text-secondary">{l.productCode}</span>
                          {s?.controlled ? (
                            <Badge tone="warning" className="ml-2">
                              {t("drawer.controlled")}
                            </Badge>
                          ) : null}
                          {s && s.reserved.length > 0 ? (
                            <span className="mt-1 block text-caption text-text-secondary">
                              {t("drawer.reserve")}{" "}
                              {s.reserved.map((r) => `${r.batch} × ${formatQuantity(r.qty)} · ${day(r.expiryDate)} · ${r.zone}`).join("; ")}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {s ? formatQuantity(s.available) : "—"}
                          {s?.nearestExpiry ? (
                            <span className="block text-caption text-text-secondary">{t("entry.expiry", { d: day(s.nearestExpiry) })}</span>
                          ) : null}
                        </td>
                        <td className="px-3 py-1 text-right">
                          {editable ? (
                            <TextField
                              label={`${t("drawer.qty")}, ${i + 1}`}
                              size="sm"
                              value={l.qty}
                              onChange={(v) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, qty: v } : x)))}
                              inputMode="numeric"
                              error={over ? t("entry.eQty", { n: formatQuantity(s.available) }) : undefined}
                              className="ml-auto w-28 [&>:first-child]:sr-only [&_input]:text-right"
                            />
                          ) : (
                            <span className="tabular-nums">{formatQuantity(qty)}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {price ? (
                            <span className="inline-flex items-center gap-1.5" title={t("entry.priceLock")}>
                              {formatMoney(price)}
                              {editable ? <Lock size={13} strokeWidth={1.5} aria-hidden className="text-text-secondary" /> : null}
                            </span>
                          ) : (
                            <span className="text-text-disabled">{s ? t("drawer.noPrice") : "—"}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums">
                          {s?.amount && !dirty ? formatMoney(s.amount) : "—"}
                        </td>
                        {editable ? (
                          <td className="px-1">
                            <Button
                              variant="icon"
                              icon={X}
                              aria-label={t("drawer.removeLine")}
                              onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                            />
                          </td>
                        ) : null}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {editable ? (
            <div className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-2.5">
              <Select
                label={t("drawer.product")}
                value={adding.product}
                loadOptions={async (q) => {
                  const found = await searchProducts(q);
                  found.forEach((o) => seen.current.set(o.value, { code: o.sub, name: o.label }));
                  return found;
                }}
                onChange={(v) => setAdding((a) => ({ ...a, product: v }))}
                placeholder={t("entry.quickPh")}
                options={[]}
                size="sm"
                className="w-80 max-w-full [&>:first-child]:sr-only"
              />
              <TextField
                label={t("drawer.qty")}
                size="sm"
                value={adding.qty}
                onChange={(v) => setAdding((a) => ({ ...a, qty: v }))}
                inputMode="numeric"
                suffix={t("unit.pcs")}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addLine())}
                className="w-32 [&>:first-child]:sr-only [&_input]:text-right"
              />
              <Button variant="tertiary" size="sm" icon={Plus} onClick={addLine}>
                {t("drawer.addLine")}
              </Button>
              <span className="text-caption text-text-secondary">{t("entry.keys")}</span>
            </div>
          ) : null}
          <dl
            aria-label={t("customer.totals")}
            className="sticky bottom-0 flex flex-wrap items-center justify-end gap-x-7 gap-y-1 rounded-b-card border-t border-border bg-table-header px-4 py-3.5"
          >
            <div className="flex gap-1.5">
              <dt className="text-text-secondary">{t("entry.tLines")}</dt>
              <dd className="tabular-nums">{formatQuantity(lines.length)}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-text-secondary">{t("entry.tQty")}</dt>
              <dd className="tabular-nums">{formatQuantity(totalQty)}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-text-secondary">{t("entry.tVat")}</dt>
              <dd className="tabular-nums">{doc && !dirty ? formatMoney(doc.vatTotal) : lines.length ? "—" : formatMoney("0")}</dd>
            </div>
            <div className="flex items-baseline gap-2 border-l border-border pl-6">
              <dt className="text-text-secondary">{t("entry.tTotal")}</dt>
              <dd className="text-[18px] leading-6 font-semibold tabular-nums">
                {doc && !dirty ? formatMoney(doc.total) : lines.length ? "—" : formatMoney("0")}
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </>
  );

  if (frame === "page")
    return (
      <div className="flex flex-col gap-4">
        <DocumentHeader
          parent={{ label: t("page.parent"), href: "/orders" }}
          crumb={doc ? doc.number : t("drawer.new")}
          crumbMono={doc !== null}
          title={doc ? t("page.title") : t("drawer.new")}
          number={doc?.number}
          status={<OrderStatusBadge status={doc?.status ?? "DRAFT"} />}
          sub={
            doc ? (
              <>
                <span>{doc.customer}</span>
                <span className="text-text-disabled">·</span>
                <span className="inline-flex items-center gap-1">
                  {doc.deliveryType === "PICKUP" ? (
                    <Store size={14} strokeWidth={1.5} aria-hidden />
                  ) : (
                    <Truck size={14} strokeWidth={1.5} aria-hidden />
                  )}
                  {doc.deliveryType === "PICKUP" ? t("list.pickup") : t("list.delivery")}
                </span>
                {doc.deliveryDate ? (
                  <>
                    <span className="text-text-disabled">·</span>
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      <CalendarDays size={14} strokeWidth={1.5} aria-hidden />
                      {day(doc.deliveryDate)}
                    </span>
                  </>
                ) : null}
                {doc.createdBy ? (
                  <>
                    <span className="text-text-disabled">·</span>
                    <span>{doc.createdBy}</span>
                  </>
                ) : null}
              </>
            ) : undefined
          }
          actions={actions}
        />
        {doc && !editable ? (
          <>
            <OrderStepper doc={doc} />
            <Decision doc={doc} />
            {doc.status === "QUEUED" && can(me.data, "orders.queue") ? <TimeForm doc={doc} /> : null}
            {doc.status === "CHECKING" && can(me.data, "orders.check") ? <CheckForm doc={doc} /> : null}
            {err.message ? <Alert tone="danger" title={err.message} /> : null}
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
              <OrderCardBody doc={doc} shipping={<DocumentsRow doc={doc} />} />
              <OrderCardAside doc={doc} />
            </div>
          </>
        ) : (
          content
        )}
        {dialogs}
      </div>
    );
  return (
    <Drawer
      open
      onClose={dialog ? () => undefined : requestClose}
      size="lg"
      kind={doc ? t("drawer.kindBy", { name: doc.createdBy }) : t("drawer.kind")}
      title={doc ? doc.number : t("drawer.new")}
      subtitle={doc ? `${doc.customer}${doc.customerTin ? ` · ${doc.customerTin}` : ""}` : undefined}
      status={doc ? <OrderStatusBadge status={doc.status} /> : undefined}
      actions={actions}
    >
      {content}
      {dialogs}
    </Drawer>
  );
}

function Decision({ doc }: { doc: OrderDetail | null }) {
  const t = useTranslations("orders");
  if (!doc) return null;
  if (doc.status === "PENDING_APPROVAL")
    return (
      <Alert tone="warning" title={doc.approvalLevel === "DIRECTOR" ? t("drawer.needDirector") : t("drawer.needBranch")}>
        <ul className="list-disc pl-5">
          {doc.approvalReasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </Alert>
    );
  if (doc.status === "REJECTED")
    return (
      <Alert tone="danger" title={t("drawer.rejectedReason", { reason: doc.decisionReason ?? "" })}>
        {doc.decidedBy}
      </Alert>
    );
  if (doc.status === "CANCELLED")
    return (
      <Alert tone="info" title={t("drawer.cancelledReason", { reason: doc.cancelReason ?? "" })}>
        {doc.cancelledBy}
      </Alert>
    );
  if (doc.status === "QUEUED")
    return (
      <Alert tone="info" title={t("drawer.queuedTitle")}>
        {doc.decidedBy ? t("drawer.pricesFrozenBy", { name: doc.decidedBy }) : t("drawer.pricesFrozen")}
      </Alert>
    );
  return null;
}

/** «Hozir kimda» va hujjatlar zanjiri (SPEC 5.2, 7): NK → SV / HF → QM, reys va haydovchi. */
function DocumentsRow({ doc }: { doc: OrderDetail }) {
  const t = useTranslations("orders");
  const me = useMe();
  const canExportCodes = can(me.data, "marking.export");
  const canPrintInvoice = can(me.data, "orders.view");
  const d = doc.documents;
  const items: { label: string; value: string; note?: string }[] = [];
  if (d.waybillNumber) items.push({ label: t("docs.waybill"), value: d.waybillNumber });
  if (d.tripNumber) items.push({ label: t("docs.trip"), value: d.tripNumber, note: [d.driver, d.vehicle].filter(Boolean).join(" · ") });
  if (d.saleNumber)
    items.push({
      label: d.saleStatus === "CANCELLED" ? t("docs.saleCancelled") : t("docs.sale"),
      value: d.saleNumber,
      note: d.saleTotal ? t("sum", { amount: formatMoney(d.saleTotal) }) : undefined,
    });
  if (d.invoiceNumber) items.push({ label: t("docs.invoice"), value: d.invoiceNumber });
  if (d.returnNumber)
    items.push({
      label: t("docs.return"),
      value: d.returnNumber,
      note: d.returnTotal ? t("sum", { amount: formatMoney(d.returnTotal) }) : undefined,
    });
  return (
    <div className="rounded-card border border-border p-3" aria-label={t("docs.aria")}>
      <div className="text-caption text-text-secondary">{t("docs.holder")}</div>
      <div className="mb-2">{doc.holder}</div>
      {items.length > 0 ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 md:grid-cols-5">
          {items.map((i) => (
            <div key={i.label}>
              <dt className="text-caption text-text-secondary">{i.label}</dt>
              <dd className="font-mono">{i.value}</dd>
              {i.note ? <dd className="text-caption text-text-secondary">{i.note}</dd> : null}
            </div>
          ))}
        </dl>
      ) : null}
      {doc.lines.some((l) => l.marked) && canExportCodes ? (
        <a
          href={codesExportUrl({ orderId: doc.id })}
          download
          className="mt-2 mr-2 inline-flex h-control-sm items-center gap-2 rounded-control px-3 text-primary hover:bg-primary-soft"
        >
          <FileDown size={16} strokeWidth={1.5} aria-hidden />
          {t("docs.exportCodes")}
        </a>
      ) : null}
      {d.waybillNumber ? (
        <Button
          variant="tertiary"
          size="sm"
          icon={Printer}
          className="mt-2"
          onClick={() => window.open(`/api/orders/${doc.id}/waybill/pdf`, "_blank", "noopener")}
        >
          {t("docs.printWaybill")}
        </Button>
      ) : null}
      {d.invoiceNumber && canPrintInvoice ? (
        <Button
          variant="tertiary"
          size="sm"
          icon={Printer}
          className="mt-2"
          onClick={() => window.open(`/api/orders/${doc.id}/invoice/pdf`, "_blank", "noopener")}
        >
          {t("docs.printInvoice")}
        </Button>
      ) : null}
    </div>
  );
}

/** Mijoz qatori (SPEC 5.3): narx turi, qarz, muddati oʻtgan qarz, limit va qolgan limit. */
function CreditRow({ doc }: { doc: OrderDetail }) {
  const t = useTranslations("orders");
  const c = doc.credit;
  const overdue = c.overdueDays > 0;
  const items: { label: string; value: string; tone?: "danger" | "warning" }[] = [
    { label: t("credit.priceType"), value: c.priceType ?? t("credit.basePrice") },
    { label: t("credit.debt"), value: t("sum", { amount: formatMoney(c.debt) }) },
    {
      label: t("credit.overdue"),
      value: overdue ? t("credit.overdueValue", { amount: formatMoney(c.overdue), days: c.overdueDays }) : t("credit.none"),
      tone: overdue ? "danger" : undefined,
    },
    { label: t("credit.limit"), value: c.creditLimit ? t("sum", { amount: formatMoney(c.creditLimit) }) : t("credit.notSet") },
    {
      label: t("credit.limitLeft"),
      value: c.limitLeft ? t("sum", { amount: formatMoney(c.limitLeft) }) : "—",
      tone: c.limitLeft && c.limitLeft.startsWith("-") ? "warning" : undefined,
    },
  ];
  return (
    <div className="grid grid-cols-5 gap-3 rounded-card border border-border bg-background p-3">
      {items.map((i) => (
        <div key={i.label} className="flex flex-col">
          <span className="text-caption text-text-secondary">{i.label}</span>
          <span className={i.tone === "danger" ? "text-danger" : i.tone === "warning" ? "text-warning" : undefined}>{i.value}</span>
        </div>
      ))}
    </div>
  );
}

/** «N ta muammo» paneli: xato — yuborilmaydi, tasdiq — tasdiqqa ketadi, ogohlantirish — faqat maʼlumot. */
function IssuesPanel({ issues, dirty }: { issues: OrderIssue[]; dirty: boolean }) {
  const t = useTranslations("orders");
  const [open, setOpen] = useState(true);
  if (issues.length === 0 && !dirty) return <Alert tone="success" title={t("issuesPanel.none")} />;
  if (issues.length === 0) return null;
  const errors = issues.filter((i) => i.level === "ERROR").length;
  const Head = errors ? CircleAlert : TriangleAlert;
  const tone = errors ? "text-danger" : "text-warning";
  // Prototip «Muammolar»: yigʻiladigan blok — sarlavha rangi eng ogʻir daraja boʻyicha
  return (
    <section className={`rounded-card border bg-surface shadow-sm ${errors ? "border-danger/30" : "border-warning/30"}`}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`flex min-h-11 w-full items-center gap-2.5 rounded-card px-3.5 py-2 text-left ${errors ? "bg-danger-bg" : "bg-warning-bg"}`}
      >
        <Head size={16} strokeWidth={1.5} aria-hidden className={`shrink-0 ${tone}`} />
        <span className={`font-semibold whitespace-nowrap ${tone}`}>{t("entry.probTitle")}</span>
        <span className="min-w-0 flex-1 truncate text-caption text-text-secondary">
          {errors ? t("issuesPanel.countBlocking", { count: issues.length, errors }) : t("issuesPanel.count", { count: issues.length })}
          {dirty ? ` ${t("issuesPanel.stale")}` : ""}
        </span>
        {open ? (
          <ChevronUp size={16} strokeWidth={1.5} aria-hidden className="shrink-0 text-text-secondary" />
        ) : (
          <ChevronDown size={16} strokeWidth={1.5} aria-hidden className="shrink-0 text-text-secondary" />
        )}
      </button>
      {open ? (
        <ul className="flex flex-col gap-0.5 border-t border-border px-1.5 pt-1 pb-2">
          {issues.map((i) => (
            <li
              key={`${i.code}-${i.lineNo ?? "h"}-${i.message}`}
              className="flex items-start gap-2 rounded-control px-2 py-1.5 text-[13px] leading-[18px]"
            >
              {i.level === "ERROR" ? (
                <CircleAlert size={14} strokeWidth={1.5} className="mt-0.5 shrink-0 text-danger" aria-label={t("issuesPanel.error")} />
              ) : i.level === "APPROVAL" ? (
                <TriangleAlert
                  size={14}
                  strokeWidth={1.5}
                  className="mt-0.5 shrink-0 text-warning"
                  aria-label={t("issuesPanel.approval")}
                />
              ) : (
                <Info size={14} strokeWidth={1.5} className="mt-0.5 shrink-0 text-info" aria-label={t("issuesPanel.warning")} />
              )}
              <span className="min-w-0 flex-1">{i.message}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function TimeForm({ doc }: { doc: OrderDetail }) {
  const t = useTranslations("orders");
  const qc = useQueryClient();
  const marked = doc.lines.some((l) => l.marked);
  const [pick, setPick] = useState(doc.pickMinutes ? String(doc.pickMinutes) : "");
  const [mark, setMark] = useState(doc.markMinutes ? String(doc.markMinutes) : "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const err = describeError(error);
  async function submit() {
    setPending(true);
    setError(null);
    try {
      await ensureCsrf();
      const d = await unwrap(
        api.POST("/api/orders/{id}/time", {
          params: { path: { id: doc.id } },
          body: { pickMinutes: Number(pick), markMinutes: marked && mark ? Number(mark) : undefined },
        }),
      );
      qc.setQueryData(["orders", "one", d.id], d);
      await qc.invalidateQueries({ queryKey: ["orders", "list"] });
      toast({
        tone: "success",
        title: t("time.given"),
        description: t("time.givenHint", { number: d.number, minutes: d.pickMinutes ?? 0 }),
      });
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-card border border-border p-3">
      <TextField label={t("time.pick")} value={pick} onChange={setPick} inputMode="numeric" suffix={t("unit.minutes")} className="w-40" />
      {marked ? (
        <TextField label={t("time.mark")} value={mark} onChange={setMark} inputMode="numeric" suffix={t("unit.minutes")} className="w-40" />
      ) : null}
      <Button variant="secondary" loading={pending} disabled={!/^\d+$/.test(pick)} onClick={() => void submit()}>
        {doc.pickMinutes ? t("time.change") : t("time.give")}
      </Button>
      {doc.picker ? <span className="text-text-secondary">{t("time.picker", { name: doc.picker })}</span> : null}
      {err.message ? <Alert tone="danger" title={err.message} className="w-full" /> : null}
    </div>
  );
}

/** Qaytariladigan qatorlar: belgilanmagan yoki hammasi belgilangan — null (butun buyurtma). */
export function returnLineIds(lines: { id: number }[], marked: Record<number, boolean>): number[] | null {
  const ids = lines.filter((l) => marked[l.id]).map((l) => l.id);
  return ids.length === 0 || ids.length === lines.length ? null : ids;
}

/** Hisobdan oʻtkazish (SPEC 5.2 №6): har qator «Tekshirildi», joylar soni; xato boʻlsa — «Yigʻishga qaytarish» (sabab bilan). */
function CheckForm({ doc }: { doc: OrderDetail }) {
  const t = useTranslations("orders");
  const qc = useQueryClient();
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [places, setPlaces] = useState(doc.places ? String(doc.places) : "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [returning, setReturning] = useState(false);
  // «Yigʻishga qaytarish» qatorlari (SPEC 188): hech biri belgilanmasa — butun buyurtma
  const [back, setBack] = useState<Record<number, boolean>>({});
  const err = describeError(error);
  const all = doc.lines.every((l) => checked[l.id]);
  const backIds = returnLineIds(doc.lines, back);

  async function run(fn: () => Promise<OrderDetail>, title: string) {
    setPending(true);
    setError(null);
    try {
      await ensureCsrf();
      const d = await fn();
      qc.setQueryData(["orders", "one", d.id], d);
      await qc.invalidateQueries({ queryKey: ["orders", "list"] });
      toast({ tone: "success", title, description: d.number });
      setReturning(false);
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-card border border-border p-3">
      <h3 className="text-subtitle">{t("check.title")}</h3>
      <ul className="flex flex-col gap-2">
        {doc.lines.map((l) => (
          <li key={l.id} className="flex items-center gap-3">
            <Checkbox
              label={t("check.checked")}
              checked={Boolean(checked[l.id])}
              onChange={(v) => setChecked((m) => ({ ...m, [l.id]: v }))}
            />
            <span className="flex-1">
              {l.productName} · <span className="tabular-nums">{formatQuantity(l.qty)}</span> {t("unit.pcs")}
            </span>
            {doc.lines.length > 1 ? (
              <Checkbox
                label={t("check.returnLine")}
                checked={Boolean(back[l.id])}
                onChange={(v) => setBack((m) => ({ ...m, [l.id]: v }))}
              />
            ) : null}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-end gap-3">
        <TextField
          label={t("check.places")}
          value={places}
          onChange={setPlaces}
          inputMode="numeric"
          suffix={t("unit.box")}
          className="w-40"
        />
        <Button
          variant="secondary"
          disabled={!all || !/^\d+$/.test(places) || Number(places) < 1}
          loading={pending && !returning}
          onClick={() =>
            void run(
              () =>
                unwrap(
                  api.POST("/api/orders/{id}/check", {
                    params: { path: { id: doc.id } },
                    body: { checkedLines: doc.lines.map((l) => l.id), places: Number(places) },
                  }),
                ),
              t("check.done"),
            )
          }
        >
          {t("check.title")}
        </Button>
        <Button variant="tertiary" icon={RotateCcw} onClick={() => setReturning(true)}>
          {backIds ? t("check.returnSelected", { count: backIds.length }) : t("check.returnPick")}
        </Button>
      </div>
      {err.message ? <Alert tone="danger" title={err.message} /> : null}
      {returning ? (
        <DeactivateDialog
          title={t("check.returnTitle", { number: doc.number })}
          consequence={backIds ? t("check.returnLinesConsequence", { count: backIds.length }) : t("check.returnConsequence")}
          actionLabel={t("check.returnPick")}
          pending={pending}
          error={error}
          onClose={() => setReturning(false)}
          onConfirm={(reason) =>
            void run(
              () =>
                unwrap(
                  api.POST("/api/orders/{id}/return-to-pick", {
                    params: { path: { id: doc.id } },
                    body: { reason, lineIds: backIds ?? undefined },
                  }),
                ),
              t("check.returned"),
            )
          }
        />
      ) : null}
    </div>
  );
}
