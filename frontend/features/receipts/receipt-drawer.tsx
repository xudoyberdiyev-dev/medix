"use client";

import { BadgePercent, Check, ClipboardCheck, PackagePlus, Trash2, X } from "lucide-react";
import { useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Checkbox, Radio } from "@/components/ui/selection-controls";
import { ErrorState, Skeleton } from "@/components/ui/system-states";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { PAYMENT_TYPES, formatIsoDate, parseMoneyInput, parseUzDate, todayTashkent } from "@/features/counterparties/api";
import { DeactivateDialog } from "@/features/organization/deactivate-dialog";
import { useWarehouses, ZONE_LABELS, type Zone } from "@/features/organization/api";
import { searchProducts } from "@/features/prices/api";
import { useEmployeeOptions } from "@/features/products/api";
import { describeError } from "@/features/setup/form-error";
import { formatDateTime, formatMoney, formatQuantity } from "@/lib/format";
import {
  BONUS_CONFIRM,
  DIFF_LABELS,
  RECEIPT_ACCEPT,
  RECEIPT_CANCEL,
  RECEIPT_CANCEL_POSTED,
  RECEIPT_CREATE,
  RECEIPT_POST,
  expectedReason,
  searchSuppliers,
  useAcceptReceipt,
  useCancelReceipt,
  useConfirmBonus,
  usePostReceipt,
  useReceipt,
  useSaveReceipt,
  type ReceiptDetail,
  type ReceiptRequest,
  type Resolution,
} from "./api";
import { ReceiptCatalogDialog } from "./receipt-catalog-dialog";
import { ReceiptStatusBadge, day } from "./receipts-page";

const KIND = "Kirim";
/** Kirim qatori manzili boʻla oladigan zonalar (Qabul va Joʻnatish — yoʻq). */
const TARGET_ZONES = new Set(["MAIN", "COLD", "SAFE", "QUARANTINE"]);

export function ReceiptDrawer(props: { id: number | null; onClose: () => void; onCreated: (id: number) => void }) {
  const doc = useReceipt(props.id);
  if (props.id !== null && doc.error)
    return (
      <Drawer open onClose={props.onClose} size="lg" kind={KIND} title="KR">
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
  batchNumber: string;
  producedOn: string;
  expiryDate: string;
  zoneId: number;
  qty: string;
  bonusQty: string;
  price: string;
}

function toDraft(d: ReceiptDetail): DraftLine[] {
  return d.lines.map((l) => ({
    productId: l.productId,
    productCode: l.productCode,
    productName: l.productName,
    batchNumber: l.batchNumber,
    producedOn: formatIsoDate(l.producedOn),
    expiryDate: formatIsoDate(l.expiryDate),
    zoneId: l.zoneId,
    qty: String(l.qty),
    bonusQty: String(l.bonusQty),
    price: l.price ?? "",
  }));
}

const emptyAdd = {
  product: null as string | null,
  batch: "",
  produced: "",
  expiry: "",
  zone: null as string | null,
  qty: "",
  bonus: "",
  price: "",
};
const isInt = (s: string) => /^\d+$/.test(s.trim());

function Editor({ doc, onClose, onCreated }: { doc: ReceiptDetail | null; onClose: () => void; onCreated: (id: number) => void }) {
  const me = useMe();
  const warehouses = useWarehouses();
  const employees = useEmployeeOptions();
  const save = useSaveReceipt();
  const post = usePostReceipt();
  const cancel = useCancelReceipt();
  const canCreate = can(me.data, RECEIPT_CREATE);
  const canAccept = can(me.data, RECEIPT_ACCEPT);
  const canPost = can(me.data, RECEIPT_POST);
  // Narxni koʻrish — server bilan bir xil qoida: tannarx huquqi yoki qabul qilmaydigan xodim.
  const pricesVisible = doc ? doc.pricesVisible : can(me.data, "special.cost") || !canAccept;
  const editable = canCreate && (!doc || doc.status === "DRAFT") && (pricesVisible || !doc?.lines.some((l) => l.price != null));

  const [warehouseId, setWarehouseId] = useState<string | null>(doc ? String(doc.warehouseId) : null);
  const [supplier, setSupplier] = useState<string | null>(doc ? String(doc.supplierId) : null);
  const [supplierLabel, setSupplierLabel] = useState(doc?.supplier ?? "");
  const [date, setDate] = useState(formatIsoDate(doc?.receiptDate ?? todayTashkent()));
  const [invoice, setInvoice] = useState(doc?.invoiceNumber ?? "");
  const [invoiceDate, setInvoiceDate] = useState(formatIsoDate(doc?.invoiceDate));
  const [paymentType, setPaymentType] = useState<string | null>(doc?.paymentType ?? "TRANSFER");
  const [due, setDue] = useState(doc?.dueManual ? formatIsoDate(doc.dueDate) : "");
  const [owner, setOwner] = useState<string | null>(doc?.ownerId ? String(doc.ownerId) : null);
  const [prepaid, setPrepaid] = useState(doc?.prepaid ?? false);
  const [fromBonus, setFromBonus] = useState(doc?.fromBonus ?? false);
  const confirmBonus = useConfirmBonus();
  const [discountKind, setDiscountKind] = useState<string | null>(doc?.discountKind ?? null);
  const [discountValue, setDiscountValue] = useState(doc?.discountValue ?? "");
  const [discountDate, setDiscountDate] = useState(formatIsoDate(doc?.discountDate));
  const [note, setNote] = useState(doc?.note ?? "");
  const [lines, setLines] = useState<DraftLine[]>(doc ? toDraft(doc) : []);
  const [adding, setAdding] = useState(emptyAdd);
  const [local, setLocal] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"accept" | "post" | "cancel" | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const seen = useRef(new Map<string, { code: string; name: string }>());
  const err = describeError(save.error ?? post.error ?? confirmBonus.error);

  const activeWarehouses = (warehouses.data ?? []).filter((w) => w.active || String(w.id) === warehouseId);
  const warehouse = activeWarehouses.find((w) => String(w.id) === warehouseId) ?? null;
  const zones: Zone[] = (warehouse?.zones ?? []).filter((z) => TARGET_ZONES.has(z.type));
  const zoneName = (id: number) => warehouse?.zones.find((z) => z.id === id)?.name ?? doc?.lines.find((l) => l.zoneId === id)?.zone ?? "";
  const canCancel =
    doc !== null &&
    ((doc.status === "POSTED" && can(me.data, RECEIPT_CANCEL_POSTED)) ||
      ((doc.status === "DRAFT" || doc.status === "ACCEPTED") && can(me.data, RECEIPT_CANCEL)));

  function body(): ReceiptRequest | null {
    if (!warehouse) return (setLocal("Omborni tanlang."), null);
    if (!supplier) return (setLocal("Yetkazib beruvchini tanlang."), null);
    const iso = parseUzDate(date);
    if (!iso) return (setLocal("Kirim sanasi KK.OO.YYYY koʻrinishida boʻlsin."), null);
    const invIso = parseUzDate(invoiceDate);
    if (invIso === null) return (setLocal("Yuk xati sanasi KK.OO.YYYY koʻrinishida boʻlsin."), null);
    const dueIso = parseUzDate(due);
    if (dueIso === null) return (setLocal("Toʻlov kuni KK.OO.YYYY koʻrinishida boʻlsin."), null);
    const discIso = parseUzDate(discountDate);
    if (discIso === null) return (setLocal("Chegirma olish sanasi KK.OO.YYYY koʻrinishida boʻlsin."), null);
    const disc = discountKind ? parseMoneyInput(discountValue) : undefined;
    if (discountKind && !disc) return (setLocal("Chegirma qiymatini kiriting."), null);
    const out: ReceiptRequest["lines"] = [];
    for (const [i, l] of lines.entries()) {
      const where = `${i + 1}-qator (${l.productName})`;
      const expiry = parseUzDate(l.expiryDate);
      if (!expiry) return (setLocal(`${where}: yaroqlilik sanasi KK.OO.YYYY koʻrinishida boʻlsin.`), null);
      const produced = parseUzDate(l.producedOn);
      if (produced === null) return (setLocal(`${where}: ishlab chiqarilgan sana KK.OO.YYYY koʻrinishida boʻlsin.`), null);
      if (!isInt(l.qty) || Number(l.qty) < 1) return (setLocal(`${where}: soni — butun musbat son.`), null);
      if (l.bonusQty && !isInt(l.bonusQty)) return (setLocal(`${where}: aksiya bonusi — butun son.`), null);
      const price = pricesVisible ? parseMoneyInput(l.price) : undefined;
      if (pricesVisible && l.price && !price) return (setLocal(`${where}: narx notoʻgʻri. Masalan: 15.000,50.`), null);
      out.push({
        productId: l.productId,
        batchNumber: l.batchNumber.trim(),
        producedOn: produced,
        expiryDate: expiry,
        zoneId: l.zoneId,
        qty: Number(l.qty),
        bonusQty: l.bonusQty ? Number(l.bonusQty) : 0,
        price: price ?? undefined,
      });
    }
    setLocal(null);
    return {
      warehouseId: warehouse.id,
      supplierId: Number(supplier),
      receiptDate: iso,
      invoiceNumber: invoice.trim() || undefined,
      invoiceDate: invIso,
      paymentType: (paymentType ?? "TRANSFER") as ReceiptRequest["paymentType"],
      dueDate: prepaid || fromBonus ? undefined : dueIso,
      ownerId: owner ? Number(owner) : undefined,
      prepaid,
      fromBonus,
      discountKind: (discountKind ?? undefined) as ReceiptRequest["discountKind"],
      discountValue: disc ?? undefined,
      discountDate: discIso,
      note: note.trim() || undefined,
      lines: out,
    };
  }

  function saveDraft(then?: (d: ReceiptDetail) => void) {
    const b = body();
    if (!b) return;
    save.mutate(
      { id: doc?.id, body: b },
      {
        onSuccess: (d) => {
          if (then) return then(d);
          toast({ tone: "success", title: "Qoralama saqlandi", description: d.number });
          if (!doc) onCreated(d.id);
        },
      },
    );
  }

  function addLine() {
    const label = adding.product ? seen.current.get(adding.product) : undefined;
    if (!adding.product || !label) return setLocal("Mahsulotni tanlang.");
    if (!adding.batch.trim()) return setLocal("Partiya raqamini kiriting.");
    if (!parseUzDate(adding.expiry)) return setLocal("Yaroqlilik sanasini KK.OO.YYYY koʻrinishida kiriting.");
    if (!adding.zone) return setLocal("Zonani tanlang.");
    if (!isInt(adding.qty) || Number(adding.qty) < 1) return setLocal("Soni — butun musbat son.");
    if (adding.bonus && !isInt(adding.bonus)) return setLocal("Aksiya bonusi — butun son.");
    if (pricesVisible && adding.price && !parseMoneyInput(adding.price)) return setLocal("Narx notoʻgʻri. Masalan: 15.000,50.");
    const key = `${adding.product}|${adding.batch.trim().toUpperCase()}`;
    if (lines.some((l) => `${l.productId}|${l.batchNumber.trim().toUpperCase()}` === key))
      return setLocal("Bu mahsulot va partiya allaqachon qoʻshilgan.");
    setLines((ls) => [
      ...ls,
      {
        productId: Number(adding.product),
        productCode: label.code,
        productName: label.name,
        batchNumber: adding.batch.trim(),
        producedOn: adding.produced.trim(),
        expiryDate: adding.expiry.trim(),
        zoneId: Number(adding.zone),
        qty: adding.qty.trim(),
        bonusQty: adding.bonus.trim(),
        price: pricesVisible ? (parseMoneyInput(adding.price) ?? "") : "",
      },
    ]);
    setAdding({ ...emptyAdd, zone: adding.zone });
    setLocal(null);
  }

  let amount = 0n;
  for (const l of lines) {
    const p = parseMoneyInput(l.price);
    if (p && isInt(l.qty)) {
      const [w, f = ""] = p.split(".");
      amount += (BigInt(w) * 100n + BigInt((f + "00").slice(0, 2))) * BigInt(l.qty);
    }
  }
  const amountStr = `${(amount / 100n).toString()}.${(amount % 100n).toString().padStart(2, "0")}`;

  const primaryIsAccept = doc?.status === "DRAFT" && canAccept;
  const actions = (
    <>
      {canCancel ? (
        <Button variant="tertiary" icon={X} className="mr-auto" onClick={() => (cancel.reset(), setDialog("cancel"))}>
          Hujjatni bekor qilish
        </Button>
      ) : null}
      <Button variant="secondary" onClick={onClose}>
        Ortga
      </Button>
      {editable ? (
        <Button variant={primaryIsAccept ? "secondary" : "primary"} loading={save.isPending} onClick={() => saveDraft()}>
          Qoralamani saqlash
        </Button>
      ) : null}
      {primaryIsAccept ? (
        <Button icon={ClipboardCheck} onClick={() => (editable ? saveDraft(() => setDialog("accept")) : setDialog("accept"))}>
          Qabul qilish
        </Button>
      ) : null}
      {doc?.status === "POSTED" && doc.discountKind && !doc.bonusNumber && can(me.data, BONUS_CONFIRM) ? (
        <Button
          icon={BadgePercent}
          loading={confirmBonus.isPending}
          onClick={() =>
            void confirmBonus.mutateAsync(doc.id).then(
              (d) =>
                toast({
                  tone: "success",
                  title: "Bonus tasdiqlandi",
                  description: `${d.bonusNumber ?? ""}${d.bonusAmount ? ` · ${formatMoney(d.bonusAmount)} soʻm bonus balansga` : ""}`,
                }),
              () => undefined,
            )
          }
        >
          Bonus tasdiqlandi
        </Button>
      ) : null}
      {doc?.status === "ACCEPTED" && canPost ? (
        <Button
          icon={Check}
          loading={post.isPending}
          onClick={() =>
            doc.hasDiff
              ? setDialog("post")
              : void post.mutateAsync({ id: doc.id }).then(
                  (d) => toast({ tone: "success", title: "Kirim oʻtkazildi", description: `${d.number} · qoldiqqa kirdi` }),
                  () => undefined,
                )
          }
        >
          Oʻtkazish
        </Button>
      ) : null}
    </>
  );

  return (
    <Drawer
      open
      onClose={onClose}
      size="lg"
      kind={doc ? `${KIND} · ${doc.createdBy}` : KIND}
      title={doc ? doc.number : "Yangi kirim"}
      subtitle={doc ? `${doc.supplier} · ${doc.warehouse}` : undefined}
      status={doc ? <ReceiptStatusBadge status={doc.status} /> : undefined}
      actions={actions}
    >
      <div className="flex flex-col gap-4">
        <StatusNotes doc={doc} />
        <div className="grid grid-cols-3 gap-4">
          <Select
            label="Ombor"
            value={warehouseId}
            onChange={(v) => (setWarehouseId(v), setLines([]), setAdding(emptyAdd))}
            disabled={!editable || lines.length > 0}
            options={activeWarehouses.map((w) => ({ value: String(w.id), label: w.name }))}
            hint={editable && lines.length > 0 ? "Omborni almashtirish uchun avval qatorlarni olib tashlang" : undefined}
            required
          />
          <Select
            label="Yetkazib beruvchi"
            value={supplier}
            loadOptions={async (q) => {
              const found = await searchSuppliers(q);
              found.forEach((o) => seen.current.set(`s:${o.value}`, { code: o.sub, name: o.label }));
              return found;
            }}
            onChange={(v) => (setSupplier(v), setSupplierLabel(v ? (seen.current.get(`s:${v}`)?.name ?? "") : ""))}
            placeholder={supplierLabel || "Nom yoki STIR boʻyicha qidiring"}
            options={supplier && supplierLabel ? [{ value: supplier, label: supplierLabel }] : []}
            disabled={!editable}
            required
            className="col-span-2"
          />
          <TextField label="Kirim sanasi" value={date} onChange={setDate} placeholder="KK.OO.YYYY" disabled={!editable} required />
          <TextField label="Yuk xati raqami" value={invoice} onChange={setInvoice} disabled={!editable} />
          <TextField label="Yuk xati sanasi" value={invoiceDate} onChange={setInvoiceDate} placeholder="KK.OO.YYYY" disabled={!editable} />
          <Select label="Toʻlov turi" value={paymentType} onChange={setPaymentType} options={PAYMENT_TYPES} disabled={!editable} />
          <TextField
            label="Toʻlov kuni"
            value={prepaid || fromBonus ? "" : due}
            onChange={setDue}
            placeholder={doc?.dueDate && !doc.dueManual ? formatIsoDate(doc.dueDate) : "KK.OO.YYYY"}
            hint="Boʻsh — kirim sanasi + yetkazib beruvchi sharti"
            disabled={!editable || prepaid || fromBonus}
          />
          <Select
            label="Kim nomiga"
            value={owner}
            onChange={setOwner}
            placeholder="Tanlanmagan"
            options={(employees.data ?? []).map((e) => ({ value: String(e.id), label: e.fullName, sub: e.roleName }))}
            disabled={!editable}
          />
          <Checkbox
            label="100% oldindan toʻlangan"
            description="Qarz va eslatma yoʻq — avansdan yopiladi"
            checked={prepaid}
            onChange={(v) => (setPrepaid(v), v && setFromBonus(false))}
            disabled={!editable}
          />
          <Checkbox
            label="Bonus balans hisobidan"
            description="Qarz yoʻq, tannarx 0 — partiya «Bonus»"
            checked={fromBonus}
            onChange={(v) => (setFromBonus(v), v && (setPrepaid(false), setDiscountKind(null)))}
            disabled={!editable}
          />
          <Select
            label="Chegirma (bonus)"
            value={discountKind}
            onChange={setDiscountKind}
            placeholder="Yoʻq"
            hint={fromBonus ? "Bonus hisobidan kirimda chegirma boʻlmaydi" : undefined}
            options={[
              { value: "SUM", label: "Summa" },
              { value: "PERCENT", label: "Foiz" },
            ]}
            disabled={!editable || fromBonus}
          />
          <TextField
            label="Chegirma qiymati"
            value={discountValue}
            onChange={setDiscountValue}
            suffix={discountKind === "PERCENT" ? "%" : "soʻm"}
            inputMode="decimal"
            disabled={!editable || !discountKind}
          />
          <TextField
            label="Chegirma olish sanasi"
            value={discountDate}
            onChange={setDiscountDate}
            placeholder="KK.OO.YYYY"
            disabled={!editable || !discountKind}
          />
          <TextField label="Izoh" value={note} onChange={setNote} disabled={!editable} className="col-span-3" />
        </div>

        {editable && warehouse ? (
          <div className="grid grid-cols-4 items-end gap-3 rounded-card border border-border p-3">
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
              className="col-span-3"
            />
            <Select
              label="Zona"
              value={adding.zone}
              onChange={(v) => setAdding((a) => ({ ...a, zone: v }))}
              options={zones.map((z) => ({ value: String(z.id), label: z.name, sub: ZONE_LABELS[z.type] }))}
            />
            <TextField label="Partiya" value={adding.batch} onChange={(v) => setAdding((a) => ({ ...a, batch: v }))} />
            <TextField
              label="Ishlab chiqarilgan"
              value={adding.produced}
              onChange={(v) => setAdding((a) => ({ ...a, produced: v }))}
              placeholder="KK.OO.YYYY"
            />
            <TextField
              label="Yaroqlilik"
              value={adding.expiry}
              onChange={(v) => setAdding((a) => ({ ...a, expiry: v }))}
              placeholder="KK.OO.YYYY"
            />
            <TextField
              label="Soni"
              value={adding.qty}
              onChange={(v) => setAdding((a) => ({ ...a, qty: v }))}
              inputMode="numeric"
              suffix="dona"
            />
            <TextField
              label="Aksiya bonusi"
              value={adding.bonus}
              onChange={(v) => setAdding((a) => ({ ...a, bonus: v }))}
              inputMode="numeric"
              suffix="dona"
              hint="Masalan, 10 + 1 — bonus 1"
            />
            {pricesVisible ? (
              <TextField
                label="Faktura narxi (1 dona)"
                value={adding.price}
                onChange={(v) => setAdding((a) => ({ ...a, price: v }))}
                inputMode="decimal"
                suffix="soʻm"
                className="col-span-2"
              />
            ) : (
              <p className="col-span-2 text-caption text-text-secondary">Narxni Xarid kiritadi.</p>
            )}
            <Button variant="secondary" onClick={addLine}>
              Qator qoʻshish
            </Button>
          </div>
        ) : null}

        {local ? <Alert tone="danger" title={local} /> : null}
        {err.message ? <Alert tone="danger" title={err.message} /> : null}

        <div className="flex items-center justify-between gap-3">
          <h3 className="text-subtitle">
            Qatorlar · {formatQuantity(lines.length)}
            {pricesVisible && amount > 0n ? (
              <span className="ml-3 text-body font-normal text-text-secondary">{formatMoney(amountStr)} soʻm</span>
            ) : null}
          </h3>
          {editable && warehouse ? (
            <Button variant="secondary" size="sm" icon={PackagePlus} onClick={() => setCatalogOpen(true)}>
              Mahsulot qoʻshish
            </Button>
          ) : null}
        </div>
        <div className="overflow-x-auto rounded-card border border-border">
          <table className="w-full text-table">
            <thead className="bg-table-header text-left text-text-secondary">
              <tr>
                <th className="px-3 py-2 font-medium">Mahsulot</th>
                <th className="px-3 py-2 font-medium">Partiya</th>
                <th className="px-3 py-2 font-medium">Yaroqlilik</th>
                <th className="px-3 py-2 font-medium">Zona</th>
                <th className="px-3 py-2 text-right font-medium">Soni</th>
                <th className="px-3 py-2 text-right font-medium">Bonus</th>
                {doc && doc.status !== "DRAFT" ? <th className="px-3 py-2 text-right font-medium">Kelgan</th> : null}
                {pricesVisible ? <th className="px-3 py-2 text-right font-medium">Narx</th> : null}
                {editable ? <th className="w-10" /> : null}
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-text-secondary">
                    {editable
                      ? warehouse
                        ? "Qator yoʻq. «Mahsulot qoʻshish» katalogidan yoki yuqoridagi formadan kiriting."
                        : "Avval omborni tanlang."
                      : "Qator yoʻq."}
                  </td>
                </tr>
              ) : (
                lines.map((l, i) => {
                  const server = doc?.lines[i];
                  return (
                    <tr key={`${l.productId}-${l.batchNumber}`} className="border-t border-border">
                      <td className="px-3 py-2">
                        <span className="font-mono text-text-secondary">{l.productCode}</span> {l.productName}
                      </td>
                      <td className="px-3 py-2 font-mono">{l.batchNumber}</td>
                      <td className="px-3 py-2 tabular-nums">{l.expiryDate}</td>
                      <td className="px-3 py-2">{zoneName(l.zoneId)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{isInt(l.qty) ? formatQuantity(Number(l.qty)) : l.qty}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{l.bonusQty && l.bonusQty !== "0" ? `+${l.bonusQty}` : "—"}</td>
                      {doc && doc.status !== "DRAFT" ? (
                        <td className="px-3 py-2 text-right">
                          {server?.receivedQty != null ? (
                            <span className="flex flex-col items-end gap-1">
                              <span className="tabular-nums">
                                {formatQuantity(server.receivedQty)}
                                {server.damagedQty ? ` + ${formatQuantity(server.damagedQty)} shikast.` : ""}
                              </span>
                              {server.diffReason ? <Badge tone="warning">{DIFF_LABELS[server.diffReason]}</Badge> : null}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                      ) : null}
                      {pricesVisible ? (
                        <td className="px-3 py-2 text-right tabular-nums">
                          {parseMoneyInput(l.price) ? (
                            formatMoney(parseMoneyInput(l.price)!)
                          ) : (
                            <span className="text-text-disabled">kiritilmagan</span>
                          )}
                        </td>
                      ) : null}
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
      {catalogOpen && warehouse ? (
        <ReceiptCatalogDialog
          warehouseId={warehouse.id}
          supplierId={supplier ? Number(supplier) : null}
          zones={zones}
          defaultZone={adding.zone || null}
          pricesVisible={pricesVisible}
          existing={new Set(lines.map((l) => `${l.productId}|${l.batchNumber.trim().toUpperCase()}`))}
          header={[
            doc?.number ?? "Yangi kirim",
            supplierLabel || "YB tanlanmagan",
            warehouse.name,
            `${formatQuantity(lines.length)} qator`,
          ].join(" · ")}
          onClose={() => setCatalogOpen(false)}
          onAdd={(picked) => {
            setLines((ls) => [...ls, ...picked]);
            setCatalogOpen(false);
            setLocal(null);
            toast({ tone: "success", title: `${formatQuantity(picked.length)} qator qoʻshildi` });
          }}
        />
      ) : null}
      {dialog === "accept" && doc ? <AcceptDialog id={doc.id} onClose={() => setDialog(null)} /> : null}
      {dialog === "post" && doc ? <PostDialog doc={doc} onClose={() => setDialog(null)} /> : null}
      {dialog === "cancel" && doc ? (
        <DeactivateDialog
          title={`${doc.number}ni bekor qilasizmi?`}
          consequence={
            doc.status === "POSTED"
              ? "Tovar qoldiqdan chiqariladi va qarz teskari yoziladi. Partiyadan sotilgan boʻlsa, bekor qilinmaydi."
              : doc.status === "ACCEPTED"
                ? "Tovar Qabul zonasidan chiqariladi. Hujjat tarixda qoladi."
                : "Qoldiq va qarz oʻzgarmaydi. Hujjat tarixda qoladi."
          }
          actionLabel="Hujjatni bekor qilish"
          pending={cancel.isPending}
          error={cancel.error}
          onClose={() => setDialog(null)}
          onConfirm={(reason) =>
            void cancel.mutateAsync({ id: doc.id, reason }).then(
              () => (toast({ tone: "success", title: "Bekor qilindi", description: doc.number }), setDialog(null)),
              () => undefined,
            )
          }
        />
      ) : null}
    </Drawer>
  );
}

function StatusNotes({ doc }: { doc: ReceiptDetail | null }) {
  if (!doc) return null;
  if (doc.status === "CANCELLED")
    return (
      <Alert tone="info" title={`Bekor qilindi: ${doc.cancelReason ?? ""}`}>
        {doc.cancelledBy}
      </Alert>
    );
  if (doc.status === "ACCEPTED")
    return (
      <Alert tone="warning" title="Tovar Qabul zonasida — sotuvga yopiq">
        Qabul qildi: {doc.acceptedBy}
        {doc.acceptedAt ? `, ${formatDateTime(new Date(doc.acceptedAt))}` : ""}. Oʻtkazilgach saqlash zonalariga oʻtadi va qarz yoziladi.
      </Alert>
    );
  if (doc.status === "POSTED")
    return (
      <Alert tone="success" title={doc.debtAmount ? `Oʻtkazildi · qarz ${formatMoney(doc.debtAmount)} soʻm` : "Oʻtkazildi"}>
        {doc.prepaid ? "100% oldindan toʻlangan — summa avansdan yopiladi." : doc.dueDate ? `Toʻlov kuni: ${day(doc.dueDate)}.` : ""}
        {doc.supplierBalance ? ` Yetkazib beruvchi saldosi: ${formatMoney(doc.supplierBalance)} soʻm.` : ""}
        {doc.fromBonus ? " Bonus balans hisobidan — qarz yozilmadi." : ""}
        {doc.bonusNumber ? ` Bonus tasdiqlandi: ${doc.bonusNumber}${doc.bonusAmount ? `, ${formatMoney(doc.bonusAmount)} soʻm` : ""}.` : ""}
        {doc.bonusBalance ? ` Bonus balansi: ${formatMoney(doc.bonusBalance)} soʻm.` : ""}
      </Alert>
    );
  return null;
}

interface CountRow {
  received: string;
  damaged: string;
  zone: string;
}

/** Qabul (Ombor mudiri): har qatorga haqiqiy soni; farq boʻlsa — sababi. Narx koʻrsatilmaydi. */
function AcceptDialog({ id, onClose }: { id: number; onClose: () => void }) {
  const doc = useReceipt(id);
  const warehouses = useWarehouses();
  const accept = useAcceptReceipt();
  const [rows, setRows] = useState<Record<number, CountRow>>({});
  const [local, setLocal] = useState<string | null>(null);
  const err = describeError(accept.error);
  const lines = doc.data?.lines ?? [];
  const zones = (warehouses.data ?? []).find((w) => w.id === doc.data?.warehouseId)?.zones.filter((z) => TARGET_ZONES.has(z.type)) ?? [];
  const row = (lineId: number, qty: number, zoneId: number): CountRow =>
    rows[lineId] ?? { received: String(qty), damaged: "0", zone: String(zoneId) };
  const set = (lineId: number, base: CountRow, patch: Partial<CountRow>) => setRows((r) => ({ ...r, [lineId]: { ...base, ...patch } }));

  function submit() {
    const out = [];
    for (const l of lines) {
      const r = row(l.id, l.qty, l.zoneId);
      if (!isInt(r.received) || !isInt(r.damaged || "0")) return setLocal(`${l.lineNo}-qator: soni — butun son.`);
      const received = Number(r.received);
      const damaged = Number(r.damaged || "0");
      // Sabab soniga qarab aniqlanadi (server qoidasi bilan bir xil) — xodim faqat sonlarni kiritadi.
      const expected = expectedReason(l.qty, received, damaged);
      out.push({
        lineId: l.id,
        receivedQty: received,
        damagedQty: damaged,
        diffReason: expected ?? undefined,
        zoneId: Number(r.zone),
      });
    }
    setLocal(null);
    // mutateAsync: muharrir holat o'zgarganda qayta quriladi — per-call onSuccess yo'qolmasin.
    void accept.mutateAsync({ id, lines: out }).then(
      (d) => (toast({ tone: "success", title: "Qabul qilindi", description: `${d.number} · tovar Qabul zonasida` }), onClose()),
      () => undefined,
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Tovarni qabul qilish"
      primaryAction={{ label: "Qabulni tasdiqlash", loading: accept.isPending, onClick: submit }}
    >
      <div className="flex flex-col gap-3">
        <p className="text-text-secondary">Har qatorni sanab, haqiqiy sonini kiriting. Shikastlangani Karantinga tushadi.</p>
        {lines.map((l) => {
          const r = row(l.id, l.qty, l.zoneId);
          const expected =
            isInt(r.received) && isInt(r.damaged || "0") ? expectedReason(l.qty, Number(r.received), Number(r.damaged || "0")) : null;
          return (
            <div
              key={l.id}
              className="grid grid-cols-[2fr_1fr_1fr_1.4fr_1.2fr] items-end gap-3 border-b border-border pb-3 last:border-b-0"
            >
              <div className="flex flex-col">
                <span>{l.productName}</span>
                <span className="text-caption text-text-secondary">
                  {l.batchNumber} · hujjatda {formatQuantity(l.qty)}
                  {l.bonusQty ? ` + ${formatQuantity(l.bonusQty)} bonus` : ""}
                </span>
              </div>
              <TextField label="Yaroqli" size="sm" value={r.received} onChange={(v) => set(l.id, r, { received: v })} inputMode="numeric" />
              <TextField
                label="Shikastlangan"
                size="sm"
                value={r.damaged}
                onChange={(v) => set(l.id, r, { damaged: v })}
                inputMode="numeric"
              />
              <div className="flex flex-col gap-1">
                <span className="text-caption text-text-secondary">Farq sababi</span>
                {expected ? (
                  <Badge tone={expected === "DAMAGED" ? "danger" : "warning"}>{DIFF_LABELS[expected]}</Badge>
                ) : (
                  <span className="text-text-secondary">Farq yoʻq</span>
                )}
              </div>
              <Select
                label="Zona"
                size="sm"
                value={r.zone}
                onChange={(v) => set(l.id, r, { zone: v ?? r.zone })}
                options={zones.map((z) => ({ value: String(z.id), label: z.name }))}
              />
            </div>
          );
        })}
        {local ? <Alert tone="danger" title={local} /> : null}
        {err.message ? <Alert tone="danger" title={err.message} /> : null}
      </div>
    </Modal>
  );
}

/** Farq boʻlsa — qaror: qarz haqiqiy soni boʻyicha yoki hujjat boʻyicha. */
function PostDialog({ doc, onClose }: { doc: ReceiptDetail; onClose: () => void }) {
  const post = usePostReceipt();
  const [resolution, setResolution] = useState<Resolution>("ACTUAL");
  const err = describeError(post.error);
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Kirimni oʻtkazish"
      primaryAction={{
        label: "Oʻtkazish",
        loading: post.isPending,
        onClick: () =>
          void post.mutateAsync({ id: doc.id, resolution }).then(
            (d) => (toast({ tone: "success", title: "Kirim oʻtkazildi", description: `${d.number} · qoldiqqa kirdi` }), onClose()),
            () => undefined,
          ),
      }}
    >
      <div className="flex flex-col gap-3">
        <p className="text-text-secondary">Qabulda farq bor. Qarz qaysi son boʻyicha yozilsin?</p>
        <Radio
          name="resolution"
          value="ACTUAL"
          label="Haqiqiy soni boʻyicha"
          description={doc.actualAmount ? `${formatMoney(doc.actualAmount)} soʻm` : "Kelgan (yaroqli + shikastlangan) soni"}
          checked={resolution === "ACTUAL"}
          onChange={() => setResolution("ACTUAL")}
        />
        <Radio
          name="resolution"
          value="DOCUMENT"
          label="Hujjat boʻyicha"
          description={doc.amount ? `${formatMoney(doc.amount)} soʻm` : "Yuk xatidagi soni"}
          checked={resolution === "DOCUMENT"}
          onChange={() => setResolution("DOCUMENT")}
        />
        {err.message ? <Alert tone="danger" title={err.message} /> : null}
      </div>
    </Modal>
  );
}
