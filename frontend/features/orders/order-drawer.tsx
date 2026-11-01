"use client";

import { Check, CircleAlert, History, Info, LayoutList, RotateCcw, Send, Trash2, TriangleAlert, X } from "lucide-react";
import { useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { ErrorState, Skeleton } from "@/components/ui/system-states";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { PAYMENT_TYPES, formatIsoDate, parseUzDate } from "@/features/counterparties/api";
import { DeactivateDialog } from "@/features/organization/deactivate-dialog";
import { useWarehouses } from "@/features/organization/api";
import { searchProducts } from "@/features/prices/api";
import { describeError } from "@/features/setup/form-error";
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
} from "./api";
import { CatalogDialog } from "./catalog-dialog";
import { OrderStatusBadge, day } from "./orders-page";

const KIND = "Buyurtma";

export function OrderDrawer(props: { id: number | null; onClose: () => void; onCreated: (id: number) => void }) {
  const doc = useOrder(props.id);
  if (props.id !== null && doc.error)
    return (
      <Drawer open onClose={props.onClose} size="lg" kind={KIND} title="BY">
        <ErrorState onRetry={() => doc.refetch()} />
      </Drawer>
    );
  if (props.id !== null && !doc.data)
    return (
      <Drawer open onClose={props.onClose} size="lg" kind={KIND} title="Yuklanmoqda…">
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

function Editor({ doc, onClose, onCreated }: { doc: OrderDetail | null; onClose: () => void; onCreated: (id: number) => void }) {
  const me = useMe();
  const warehouses = useWarehouses();
  const save = useSaveOrder();
  const submit = useSubmitOrder();
  const approve = useApproveOrder();
  const back = useReturnOrder();
  const reject = useRejectOrder();
  const cancel = useCancelOrder();
  const editable = can(me.data, ORDER_CREATE) && (!doc || doc.status === "DRAFT");
  const [warehouseId, setWarehouseId] = useState<string | null>(doc ? String(doc.warehouseId) : null);
  const [customer, setCustomer] = useState<string | null>(doc ? String(doc.customerId) : null);
  const [customerLabel, setCustomerLabel] = useState(doc?.customer ?? "");
  const [deliveryType, setDeliveryType] = useState<string | null>(doc?.deliveryType ?? "DELIVERY");
  const [deliveryDate, setDeliveryDate] = useState(formatIsoDate(doc?.deliveryDate));
  const [address, setAddress] = useState(doc?.address ?? "");
  const [paymentType, setPaymentType] = useState<string | null>(doc?.paymentType ?? "TRANSFER");
  const [note, setNote] = useState(doc?.note ?? "");
  const [lines, setLines] = useState<DraftLine[]>(
    doc
      ? doc.lines.map((l) => ({ productId: l.productId, productCode: l.productCode, productName: l.productName, qty: String(l.qty) }))
      : [],
  );
  const [adding, setAdding] = useState<{ product: string | null; qty: string }>({ product: null, qty: "" });
  const [local, setLocal] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"catalog" | "repeat" | "reject" | "cancel" | null>(null);
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

  function body(): OrderRequest | null {
    if (!warehouseId) return (setLocal("Omborni tanlang."), null);
    if (!customer) return (setLocal("Mijozni tanlang."), null);
    const dd = parseUzDate(deliveryDate);
    if (dd === null) return (setLocal("Yetkazish sanasi KK.OO.YYYY koʻrinishida boʻlsin."), null);
    for (const [i, l] of lines.entries()) {
      if (!isInt(l.qty) || Number(l.qty) < 1) return (setLocal(`${i + 1}-qator (${l.productName}): miqdor — butun musbat son.`), null);
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
    if (!adding.product || !label) return setLocal("Mahsulotni tanlang.");
    if (!isInt(adding.qty) || Number(adding.qty) < 1) return setLocal("Miqdor — butun musbat son.");
    const productId = Number(adding.product);
    if (lines.some((l) => l.productId === productId)) return setLocal("Bu mahsulot allaqachon qoʻshilgan — miqdorini oʻzgartiring.");
    setLines((ls) => [...ls, { productId, productCode: label.code, productName: label.name, qty: adding.qty.trim() }]);
    setAdding({ product: null, qty: "" });
    setLocal(null);
  }

  const actions = (
    <>
      {cancellable ? (
        <Button variant="tertiary" icon={X} className="mr-auto" onClick={() => (cancel.reset(), setDialog("cancel"))}>
          Buyurtmani bekor qilish
        </Button>
      ) : null}
      <Button variant="secondary" onClick={onClose}>
        Ortga
      </Button>
      {editable ? (
        <>
          <Button
            variant="secondary"
            loading={save.isPending && !submit.isPending}
            onClick={() =>
              void saveDraft().then((d) => {
                if (!d) return;
                toast({ tone: "success", title: "Qoralama saqlandi", description: d.number });
                if (!doc) onCreated(d.id);
              })
            }
          >
            Qoralamani saqlash
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
                      title: s.status === "QUEUED" ? "Buyurtma navbatga yuborildi" : "Buyurtma tasdiqqa yuborildi",
                      description: `${s.number} · ${formatMoney(s.total)} soʻm`,
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
            Yuborish
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
              () => toast({ tone: "success", title: "Qoralamaga qaytarildi" }),
              () => undefined,
            )
          }
        >
          Qoralamaga qaytarish
        </Button>
      ) : null}
      {doc?.status === "PENDING_APPROVAL" && isApprover ? (
        <>
          <Button variant="secondary" onClick={() => (reject.reset(), setDialog("reject"))}>
            Rad etish
          </Button>
          <Button
            icon={Check}
            loading={approve.isPending}
            onClick={() =>
              void approve.mutateAsync(doc.id).then(
                (d) => toast({ tone: "success", title: "Tasdiqlandi — navbatga oʻtdi", description: d.number }),
                () => undefined,
              )
            }
          >
            Tasdiqlash
          </Button>
        </>
      ) : null}
    </>
  );

  return (
    <Drawer
      open
      onClose={dialog ? () => undefined : onClose}
      size="lg"
      kind={doc ? `${KIND} · ${doc.createdBy}` : KIND}
      title={doc ? doc.number : "Yangi buyurtma"}
      subtitle={doc ? `${doc.customer}${doc.customerTin ? ` · ${doc.customerTin}` : ""}` : undefined}
      status={doc ? <OrderStatusBadge status={doc.status} /> : undefined}
      actions={actions}
    >
      <div className="flex flex-col gap-4">
        <Decision doc={doc} />
        <div className="grid grid-cols-3 gap-4">
          <Select
            label="Mijoz"
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
                  (t) => setPaymentType(t),
                  () => undefined,
                );
            }}
            placeholder={customerLabel || "Nom, STIR yoki telefon"}
            options={customer && customerLabel ? [{ value: customer, label: customerLabel }] : []}
            disabled={!editable}
            required
            className="col-span-2"
          />
          <Select
            label="Ombor"
            value={warehouseId}
            onChange={setWarehouseId}
            options={activeWarehouses.map((w) => ({ value: String(w.id), label: w.name }))}
            disabled={!editable}
            required
          />
          <Select
            label="Yetkazish turi"
            value={deliveryType}
            onChange={setDeliveryType}
            options={[
              { value: "DELIVERY", label: "Yetkazib berish" },
              { value: "PICKUP", label: "Oʻzi olib ketadi" },
            ]}
            disabled={!editable}
          />
          <TextField
            label="Yetkazish sanasi"
            value={deliveryDate}
            onChange={setDeliveryDate}
            placeholder="KK.OO.YYYY"
            disabled={!editable}
          />
          <Select label="Toʻlov turi" value={paymentType} onChange={setPaymentType} options={PAYMENT_TYPES} disabled={!editable} />
          <TextField
            label="Manzil"
            value={address}
            onChange={setAddress}
            disabled={!editable || deliveryType === "PICKUP"}
            hint={!doc ? "Boʻsh — mijoz kartasidagi manzil" : undefined}
            className="col-span-2"
          />
          <TextField label="Izoh" value={note} onChange={setNote} disabled={!editable} />
        </div>

        {doc ? <CreditRow doc={doc} /> : null}

        {editable ? (
          <div className="grid grid-cols-[1fr_9rem_auto_auto] items-end gap-3 rounded-card border border-border p-3">
            <Select
              label="Mahsulot"
              value={adding.product}
              loadOptions={async (q) => {
                const found = await searchProducts(q);
                found.forEach((o) => seen.current.set(o.value, { code: o.sub, name: o.label }));
                return found;
              }}
              onChange={(v) => setAdding((a) => ({ ...a, product: v }))}
              placeholder="Nom yoki kod boʻyicha qidiring"
              options={[]}
            />
            <TextField
              label="Miqdor"
              value={adding.qty}
              onChange={(v) => setAdding((a) => ({ ...a, qty: v }))}
              inputMode="numeric"
              suffix="dona"
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addLine())}
            />
            <Button variant="secondary" onClick={addLine}>
              Qator qoʻshish
            </Button>
            <Button variant="tertiary" icon={History} disabled={!customer} onClick={() => setDialog("repeat")}>
              Oldingi buyurtmani takrorlash
            </Button>
            <Button
              variant="tertiary"
              icon={LayoutList}
              disabled={!warehouseId}
              onClick={() => setDialog("catalog")}
              className="col-span-4 justify-self-start"
            >
              Katalogdan tanlash (qoldiq va narx bilan)
            </Button>
          </div>
        ) : null}

        {local ? <Alert tone="danger" title={local} /> : null}
        {err.message ? <Alert tone="danger" title={err.message} /> : null}
        {doc && doc.status === "DRAFT" ? <IssuesPanel issues={doc.issues} dirty={dirty} /> : null}

        <div className="flex items-center justify-between gap-3">
          <h3 className="text-subtitle">
            Qatorlar · {formatQuantity(lines.length)}
            {doc && !dirty ? <span className="ml-3 text-body font-normal text-text-secondary">{formatMoney(doc.total)} soʻm</span> : null}
          </h3>
          {dirty ? <span className="text-caption text-text-secondary">Qoldiq va narx saqlangandan keyin yangilanadi</span> : null}
        </div>
        <div className="overflow-x-auto rounded-card border border-border">
          <table className="w-full text-table">
            <thead className="bg-table-header text-left text-text-secondary">
              <tr>
                <th className="px-3 py-2 font-medium">Mahsulot</th>
                <th className="px-3 py-2 text-right font-medium">Mavjud</th>
                <th className="px-3 py-2 font-medium">Eng yaqin muddat</th>
                <th className="px-3 py-2 text-right font-medium">Miqdor</th>
                <th className="px-3 py-2 text-right font-medium">Narx</th>
                <th className="px-3 py-2 text-right font-medium">Summa</th>
                {editable ? <th className="w-10" /> : null}
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-text-secondary">
                    {editable ? "Qator yoʻq. Mahsulot va miqdorni kiriting yoki oldingi buyurtmani takrorlang." : "Qator yoʻq."}
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
                            Nazoratdagi
                          </Badge>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{s ? formatQuantity(s.available) : "—"}</td>
                      <td className="px-3 py-2 tabular-nums">{s?.nearestExpiry ? day(s.nearestExpiry) : "—"}</td>
                      <td className="px-3 py-1 text-right">
                        {editable ? (
                          <TextField
                            label="Miqdor"
                            size="sm"
                            value={l.qty}
                            onChange={(v) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, qty: v } : x)))}
                            inputMode="numeric"
                            error={over ? `Mavjud ${formatQuantity(s.available)}` : undefined}
                            className="ml-auto w-28 [&>label]:sr-only [&_input]:text-right"
                          />
                        ) : (
                          <span className="tabular-nums">{formatQuantity(qty)}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {price ? formatMoney(price) : <span className="text-text-disabled">{s ? "narx yoʻq" : "—"}</span>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{s?.amount && !dirty ? formatMoney(s.amount) : "—"}</td>
                      {editable ? (
                        <td className="px-1">
                          <Button
                            variant="icon"
                            icon={Trash2}
                            aria-label="Qatorni olib tashlash"
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
          header={`${doc?.number ?? "Yangi buyurtma"} · ${customerLabel || "mijoz tanlanmagan"} · ${
            activeWarehouses.find((w) => String(w.id) === warehouseId)?.name ?? ""
          } · ${formatQuantity(lines.length)} qator`}
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
      {dialog === "repeat" && customer ? (
        <RepeatDialog
          customerId={Number(customer)}
          onClose={() => setDialog(null)}
          onPick={(picked) => {
            setLines(picked);
            setDialog(null);
            toast({ tone: "info", title: "Qatorlar qoʻshildi", description: "Qoldiq va narx saqlanganda yangidan hisoblanadi." });
          }}
        />
      ) : null}
      {(dialog === "reject" || dialog === "cancel") && doc ? (
        <DeactivateDialog
          title={dialog === "reject" ? `${doc.number}ni rad etasizmi?` : `${doc.number}ni bekor qilasizmi?`}
          consequence={
            dialog === "reject" ? "Buyurtma bajarilmaydi. Operator sababni koʻradi." : "Zahira boʻshaydi. Hujjat tarixda qoladi."
          }
          actionLabel={dialog === "reject" ? "Buyurtmani rad etish" : "Buyurtmani bekor qilish"}
          pending={dialog === "reject" ? reject.isPending : cancel.isPending}
          error={dialog === "reject" ? reject.error : cancel.error}
          onClose={() => setDialog(null)}
          onConfirm={(reason) =>
            void (dialog === "reject" ? reject : cancel).mutateAsync({ id: doc.id, reason }).then(
              () => (
                toast({ tone: "success", title: dialog === "reject" ? "Rad etildi" : "Bekor qilindi", description: doc.number }),
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
  if (!doc) return null;
  if (doc.status === "PENDING_APPROVAL")
    return (
      <Alert tone="warning" title={doc.approvalLevel === "DIRECTOR" ? "Direktor tasdigʻi kerak" : "Filial rahbari tasdigʻi kerak"}>
        <ul className="list-disc pl-5">
          {doc.approvalReasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </Alert>
    );
  if (doc.status === "REJECTED")
    return (
      <Alert tone="danger" title={`Rad etildi: ${doc.decisionReason ?? ""}`}>
        {doc.decidedBy}
      </Alert>
    );
  if (doc.status === "CANCELLED")
    return (
      <Alert tone="info" title={`Bekor qilindi: ${doc.cancelReason ?? ""}`}>
        {doc.cancelledBy}
      </Alert>
    );
  if (doc.status === "QUEUED")
    return (
      <Alert tone="info" title="Navbatda — ombor yigʻishga tayyorlaydi">
        Narxlar muzlatilgan{doc.decidedBy ? `. Tasdiqladi: ${doc.decidedBy}` : ""}.
      </Alert>
    );
  return null;
}

/** Mijoz qatori (SPEC 5.3): narx turi, qarz, muddati oʻtgan qarz, limit va qolgan limit. */
function CreditRow({ doc }: { doc: OrderDetail }) {
  const c = doc.credit;
  const overdue = c.overdueDays > 0;
  const items: { label: string; value: string; tone?: "danger" | "warning" }[] = [
    { label: "Narx turi", value: c.priceType ?? "Narx (bazaviy)" },
    { label: "Qarz", value: `${formatMoney(c.debt)} soʻm` },
    {
      label: "Muddati oʻtgan",
      value: overdue ? `${formatMoney(c.overdue)} soʻm · ${c.overdueDays} kun` : "yoʻq",
      tone: overdue ? "danger" : undefined,
    },
    { label: "Limit", value: c.creditLimit ? `${formatMoney(c.creditLimit)} soʻm` : "belgilanmagan" },
    {
      label: "Qolgan limit",
      value: c.limitLeft ? `${formatMoney(c.limitLeft)} soʻm` : "—",
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
  if (issues.length === 0 && !dirty) return <Alert tone="success" title="Muammo yoʻq — buyurtmani yuborish mumkin" />;
  if (issues.length === 0) return null;
  const errors = issues.filter((i) => i.level === "ERROR").length;
  return (
    <div className="rounded-card border border-border">
      <div className="border-b border-border px-3 py-2 font-medium">
        {issues.length} ta muammo{errors ? ` · ${errors} tasi yuborishga toʻsiq` : ""}
        {dirty ? <span className="ml-2 text-caption font-normal text-text-secondary">(oxirgi saqlangan holat boʻyicha)</span> : null}
      </div>
      <ul>
        {issues.map((i) => (
          <li
            key={`${i.code}-${i.lineNo ?? "h"}-${i.message}`}
            className="flex items-start gap-2 border-b border-border px-3 py-2 last:border-b-0"
          >
            {i.level === "ERROR" ? (
              <CircleAlert size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-danger" aria-label="Xato" />
            ) : i.level === "APPROVAL" ? (
              <TriangleAlert size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-warning" aria-label="Tasdiq kerak" />
            ) : (
              <Info size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-info" aria-label="Ogohlantirish" />
            )}
            <span>{i.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RepeatDialog({ customerId, onClose, onPick }: { customerId: number; onClose: () => void; onPick: (lines: DraftLine[]) => void }) {
  const [list, setList] = useState<Awaited<ReturnType<typeof previousOrders>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  if (list === null && error === null) {
    void previousOrders(customerId).then(setList, (e: unknown) => setError(describeError(e).message ?? "Yuklab boʻlmadi."));
  }
  async function apply() {
    if (picked === null) return;
    setPending(true);
    try {
      const d = await loadOrder(picked);
      onPick(d.lines.map((l) => ({ productId: l.productId, productCode: l.productCode, productName: l.productName, qty: String(l.qty) })));
    } catch (e) {
      setError(describeError(e).message ?? "Yuklab boʻlmadi.");
    } finally {
      setPending(false);
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title="Oldingi buyurtmani takrorlash"
      primaryAction={{ label: "Qatorlarni qoʻshish", disabled: picked === null, loading: pending, onClick: () => void apply() }}
    >
      {error ? <Alert tone="danger" title={error} /> : null}
      {list === null ? (
        <Skeleton className="h-24 w-full" />
      ) : list.length === 0 ? (
        <p className="text-text-secondary">Bu mijozning oldingi buyurtmasi yoʻq.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => setPicked(o.id)}
                className={`flex w-full items-center justify-between rounded-control border px-3 py-2 text-left ${picked === o.id ? "border-primary" : "border-border"}`}
              >
                <span className="font-mono">{o.number}</span>
                <span className="text-text-secondary">
                  {day(o.orderDate)} · {formatQuantity(o.lines)} qator · {formatMoney(o.total)} soʻm
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-caption text-text-secondary">
        Qoldiq va narx yangidan hisoblanadi; yetmaydiganlar muammolar panelida koʻrinadi.
      </p>
    </Modal>
  );
}
