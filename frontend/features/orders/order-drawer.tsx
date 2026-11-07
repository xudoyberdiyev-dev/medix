"use client";

import { Check, CircleAlert, FileDown, History, Info, LayoutList, Printer, RotateCcw, Send, Trash2, TriangleAlert, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  previousOrders,
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
import { clearOpenDraft, draftFormFor, readOpenDraft, writeOpenDraft } from "./open-draft";
import { OrderStatusBadge, day } from "./orders-page";

const PAYMENT_VALUES = ["TRANSFER", "CASH", "ONLINE"] as const;

export function OrderDrawer(props: { id: number | null; onClose: () => void; onCreated: (id: number) => void }) {
  const t = useTranslations("orders");
  const tc = useTranslations("common");
  const doc = useOrder(props.id);
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

/** Yopishda ogohlantirish: tahrirlanadigan hujjatda saqlanmagan qatorlar bor (yangi qoralama — qator qoʻshilgan boʻlsa). */
export function hasUnsavedChanges(s: { editable: boolean; isNew: boolean; dirty: boolean; lineCount: number }): boolean {
  return s.editable && (s.isNew ? s.lineCount > 0 : s.dirty);
}

function Editor({ doc, onClose, onCreated }: { doc: OrderDetail | null; onClose: () => void; onCreated: (id: number) => void }) {
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
  const [customer, setCustomer] = useState<string | null>(restored ? restored.customer : doc ? String(doc.customerId) : null);
  const [customerLabel, setCustomerLabel] = useState(restored?.customerLabel ?? doc?.customer ?? "");
  const [deliveryType, setDeliveryType] = useState<string | null>(restored ? restored.deliveryType : (doc?.deliveryType ?? "DELIVERY"));
  const [deliveryDate, setDeliveryDate] = useState(restored?.deliveryDate ?? formatIsoDate(doc?.deliveryDate));
  const [address, setAddress] = useState(restored?.address ?? doc?.address ?? "");
  const [paymentType, setPaymentType] = useState<string | null>(restored ? restored.paymentType : (doc?.paymentType ?? "TRANSFER"));
  const [note, setNote] = useState(restored?.note ?? doc?.note ?? "");
  const [lines, setLines] = useState<DraftLine[]>(
    restored
      ? restored.lines
      : doc
        ? doc.lines.map((l) => ({ productId: l.productId, productCode: l.productCode, productName: l.productName, qty: String(l.qty) }))
        : [],
  );
  const [adding, setAdding] = useState<{ product: string | null; qty: string }>({ product: null, qty: "" });
  const [local, setLocal] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"catalog" | "repeat" | "reject" | "cancel" | "discard" | null>(null);
  const seen = useRef(new Map<string, { code: string; name: string }>());
  const err = describeError(save.error ?? submit.error ?? approve.error ?? back.error);

  const activeWarehouses = (warehouses.data ?? []).filter((w) => w.active || String(w.id) === warehouseId);
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
        <Button variant="tertiary" icon={X} className="mr-auto" onClick={() => (cancel.reset(), setDialog("cancel"))}>
          {t("drawer.cancelOrder")}
        </Button>
      ) : null}
      <Button variant="secondary" onClick={requestClose}>
        {t("drawer.back")}
      </Button>
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
          <Button
            icon={Send}
            loading={submit.isPending}
            onClick={() =>
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
              })
            }
          >
            {t("drawer.submit")}
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
      <div className="flex flex-col gap-4">
        <Decision doc={doc} />
        {doc && doc.status !== "DRAFT" ? <DocumentsRow doc={doc} /> : null}
        <div className="grid grid-cols-3 gap-4">
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
            placeholder={customerLabel || t("drawer.customerPlaceholder")}
            options={customer && customerLabel ? [{ value: customer, label: customerLabel }] : []}
            disabled={!editable}
            required
            className="col-span-2"
          />
          <Select
            label={t("drawer.warehouse")}
            value={warehouseId}
            onChange={setWarehouseId}
            options={activeWarehouses.map((w) => ({ value: String(w.id), label: w.name }))}
            disabled={!editable}
            required
          />
          <Select
            label={t("drawer.deliveryType")}
            value={deliveryType}
            onChange={setDeliveryType}
            options={[
              { value: "DELIVERY", label: t("list.delivery") },
              { value: "PICKUP", label: t("list.pickup") },
            ]}
            disabled={!editable}
          />
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
          />
          <TextField
            label={t("drawer.address")}
            value={address}
            onChange={setAddress}
            disabled={!editable || deliveryType === "PICKUP"}
            hint={!doc ? t("drawer.addressHint") : undefined}
            className="col-span-2"
          />
          <TextField label={t("drawer.note")} value={note} onChange={setNote} disabled={!editable} />
        </div>

        {doc ? <CreditRow doc={doc} /> : null}
        {doc?.status === "QUEUED" && can(me.data, "orders.queue") ? <TimeForm doc={doc} /> : null}
        {doc?.status === "CHECKING" && can(me.data, "orders.check") ? <CheckForm doc={doc} /> : null}

        {editable ? (
          <div className="grid grid-cols-[1fr_9rem_auto_auto] items-end gap-3 rounded-card border border-border p-3">
            <Select
              label={t("drawer.product")}
              value={adding.product}
              loadOptions={async (q) => {
                const found = await searchProducts(q);
                found.forEach((o) => seen.current.set(o.value, { code: o.sub, name: o.label }));
                return found;
              }}
              onChange={(v) => setAdding((a) => ({ ...a, product: v }))}
              placeholder={t("drawer.productPlaceholder")}
              options={[]}
            />
            <TextField
              label={t("drawer.qty")}
              value={adding.qty}
              onChange={(v) => setAdding((a) => ({ ...a, qty: v }))}
              inputMode="numeric"
              suffix={t("unit.pcs")}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addLine())}
            />
            <Button variant="secondary" onClick={addLine}>
              {t("drawer.addLine")}
            </Button>
            <Button variant="tertiary" icon={History} disabled={!customer} onClick={() => setDialog("repeat")}>
              {t("drawer.repeat")}
            </Button>
            <Button
              variant="tertiary"
              icon={LayoutList}
              disabled={!warehouseId}
              onClick={() => setDialog("catalog")}
              className="col-span-4 justify-self-start"
            >
              {t("drawer.fromCatalog")}
            </Button>
          </div>
        ) : null}

        {local ? <Alert tone="danger" title={local} /> : null}
        {err.message ? <Alert tone="danger" title={err.message} /> : null}
        {doc && doc.status === "DRAFT" ? <IssuesPanel issues={doc.issues} dirty={dirty} /> : null}

        <div className="flex items-center justify-between gap-3">
          <h3 className="text-subtitle">
            {t("drawer.lines", { count: formatQuantity(lines.length) })}
            {doc && !dirty ? (
              <span className="ml-3 text-body font-normal text-text-secondary">{t("sum", { amount: formatMoney(doc.total) })}</span>
            ) : null}
          </h3>
          {dirty ? <span className="text-caption text-text-secondary">{t("drawer.recalcHint")}</span> : null}
        </div>
        <div className="overflow-x-auto rounded-card border border-border">
          <table className="w-full text-table">
            <thead className="bg-table-header text-left text-text-secondary">
              <tr>
                <th className="px-3 py-2 font-medium">{t("drawer.col.product")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("drawer.col.available")}</th>
                <th className="px-3 py-2 font-medium">{t("drawer.col.nearestExpiry")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("drawer.col.qty")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("drawer.col.price")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("drawer.col.amount")}</th>
                {editable ? <th className="w-10" /> : null}
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-text-secondary">
                    {editable ? t("drawer.noLinesEdit") : t("drawer.noLines")}
                  </td>
                </tr>
              ) : (
                lines.map((l, i) => {
                  const s = serverLine(l.productId);
                  const qty = Number(l.qty);
                  const over = s && isInt(l.qty) && qty > s.available;
                  const price = s ? (doc?.status === "DRAFT" ? s.currentPrice : s.price) : null;
                  return (
                    <tr key={l.productId} className="border-t border-border">
                      <td className="px-3 py-2">
                        <span className="font-mono text-text-secondary">{l.productCode}</span> {l.productName}
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
                      <td className="px-3 py-2 text-right tabular-nums">{s ? formatQuantity(s.available) : "—"}</td>
                      <td className="px-3 py-2 tabular-nums">{s?.nearestExpiry ? day(s.nearestExpiry) : "—"}</td>
                      <td className="px-3 py-1 text-right">
                        {editable ? (
                          <TextField
                            label={t("drawer.qty")}
                            size="sm"
                            value={l.qty}
                            onChange={(v) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, qty: v } : x)))}
                            inputMode="numeric"
                            error={over ? t("drawer.availableErr", { qty: formatQuantity(s.available) }) : undefined}
                            className="ml-auto w-28 [&>label]:sr-only [&_input]:text-right"
                          />
                        ) : (
                          <span className="tabular-nums">{formatQuantity(qty)}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {price ? formatMoney(price) : <span className="text-text-disabled">{s ? t("drawer.noPrice") : "—"}</span>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{s?.amount && !dirty ? formatMoney(s.amount) : "—"}</td>
                      {editable ? (
                        <td className="px-1">
                          <Button
                            variant="icon"
                            icon={Trash2}
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
      </div>
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
      {dialog === "repeat" && customer ? (
        <RepeatDialog
          customerId={Number(customer)}
          onClose={() => setDialog(null)}
          onPick={(picked) => {
            setLines(picked);
            setDialog(null);
            toast({ tone: "info", title: t("drawer.linesAdded"), description: t("drawer.linesAddedHint") });
          }}
        />
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
  if (issues.length === 0 && !dirty) return <Alert tone="success" title={t("issuesPanel.none")} />;
  if (issues.length === 0) return null;
  const errors = issues.filter((i) => i.level === "ERROR").length;
  return (
    <div className="rounded-card border border-border">
      <div className="border-b border-border px-3 py-2 font-medium">
        {errors ? t("issuesPanel.countBlocking", { count: issues.length, errors }) : t("issuesPanel.count", { count: issues.length })}
        {dirty ? <span className="ml-2 text-caption font-normal text-text-secondary">{t("issuesPanel.stale")}</span> : null}
      </div>
      <ul>
        {issues.map((i) => (
          <li
            key={`${i.code}-${i.lineNo ?? "h"}-${i.message}`}
            className="flex items-start gap-2 border-b border-border px-3 py-2 last:border-b-0"
          >
            {i.level === "ERROR" ? (
              <CircleAlert size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-danger" aria-label={t("issuesPanel.error")} />
            ) : i.level === "APPROVAL" ? (
              <TriangleAlert size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-warning" aria-label={t("issuesPanel.approval")} />
            ) : (
              <Info size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-info" aria-label={t("issuesPanel.warning")} />
            )}
            <span>{i.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RepeatDialog({ customerId, onClose, onPick }: { customerId: number; onClose: () => void; onPick: (lines: DraftLine[]) => void }) {
  const t = useTranslations("orders");
  const [list, setList] = useState<Awaited<ReturnType<typeof previousOrders>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  if (list === null && error === null) {
    void previousOrders(customerId).then(setList, (e: unknown) => setError(describeError(e).message ?? t("repeat.loadError")));
  }
  async function apply(id: number | null = picked) {
    if (id === null || pending) return;
    setPicked(id);
    setPending(true);
    try {
      const d = await loadOrder(id);
      onPick(d.lines.map((l) => ({ productId: l.productId, productCode: l.productCode, productName: l.productName, qty: String(l.qty) })));
    } catch (e) {
      setError(describeError(e).message ?? t("repeat.loadError"));
    } finally {
      setPending(false);
    }
  }
  const applyRef = useRef(apply);
  useEffect(() => {
    applyRef.current = apply;
  });
  useEffect(() => {
    // SPEC 5.3: Alt+1…5 — oxirgi 5 buyurtmadan birini darhol takrorlash.
    function onKey(e: KeyboardEvent) {
      if (!e.altKey || !list) return;
      const n = Number(e.code.startsWith("Digit") ? e.code.slice(5) : e.key);
      const o = Number.isInteger(n) && n >= 1 && n <= 5 ? list[n - 1] : undefined;
      if (!o) return;
      e.preventDefault();
      void applyRef.current(o.id);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [list]);
  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={t("repeat.title")}
      primaryAction={{ label: t("repeat.add"), disabled: picked === null, loading: pending, onClick: () => void apply() }}
    >
      {error ? <Alert tone="danger" title={error} /> : null}
      {list === null ? (
        <Skeleton className="h-24 w-full" />
      ) : list.length === 0 ? (
        <p className="text-text-secondary">{t("repeat.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.slice(0, 5).map((o, i) => (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => setPicked(o.id)}
                aria-keyshortcuts={`Alt+${i + 1}`}
                className={`flex w-full items-center justify-between rounded-control border px-3 py-2 text-left ${picked === o.id ? "border-primary" : "border-border"}`}
              >
                <span className="flex items-center gap-2">
                  <kbd className="rounded-sm border border-border px-1.5 text-caption text-text-secondary">Alt+{i + 1}</kbd>
                  <span className="font-mono">{o.number}</span>
                </span>
                <span className="text-text-secondary">
                  {t("repeat.row", { date: day(o.orderDate), lines: formatQuantity(o.lines), amount: formatMoney(o.total) })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-caption text-text-secondary">{t("repeat.hint")}</p>
    </Modal>
  );
}

/** Vaqt berish (Ombor mudiri, SPEC 5.2 №3): yigʻish va markirovka uchun daqiqa, har buyurtmaga alohida. */
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
