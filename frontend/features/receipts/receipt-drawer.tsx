"use client";

import { ArrowUpRight, BadgePercent, Check, CircleCheck, ClipboardCheck, PackagePlus, Undo2, Wallet, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DocumentHeader } from "@/components/ui/document-header";
import { Drawer } from "@/components/ui/drawer";
import { HistoryTimeline } from "@/components/ui/history-timeline";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Checkbox, Radio } from "@/components/ui/selection-controls";
import { ErrorState, Skeleton } from "@/components/ui/system-states";
import { Tabs } from "@/components/ui/tabs";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { PAYMENT_TYPE_VALUES, formatIsoDate, parseMoneyInput, parseUzDate, todayTashkent } from "@/features/counterparties/api";
import { DeactivateDialog } from "@/features/organization/deactivate-dialog";
import { useWarehouses, zoneLabel, type Zone } from "@/features/organization/api";
import { searchProducts } from "@/features/prices/api";
import { useEmployeeOptions } from "@/features/products/api";
import { describeError } from "@/features/setup/form-error";
import { cn } from "@/lib/cn";
import { formatDateTime, formatMoney, formatQuantity } from "@/lib/format";
import {
  BONUS_CONFIRM,
  RECEIPT_ACCEPT,
  RECEIPT_CANCEL,
  RECEIPT_CANCEL_POSTED,
  RECEIPT_CREATE,
  RECEIPT_POST,
  expectedReason,
  prepaidShortfall,
  searchSuppliers,
  useAcceptReceipt,
  useCancelReceipt,
  useConfirmBonus,
  usePostReceipt,
  useReceipt,
  useReceiptHistory,
  useSaveReceipt,
  type ReceiptDetail,
  type ReceiptRequest,
  type Resolution,
} from "./api";
import { ReceiptCatalogDialog } from "./receipt-catalog-dialog";
import { ReceiptLinesGrid } from "./receipt-lines-grid";
import { centsToMoney, expectedBonus, toCentsBig } from "./receipt-doc";
import { ReceiptStatusBadge, day } from "./receipts-page";

/** Kirim qatori manzili boʻla oladigan zonalar (Qabul va Joʻnatish — yoʻq). */
const TARGET_ZONES = new Set(["MAIN", "COLD", "SAFE", "QUARANTINE"]);

/**
 * Kirim hujjati toʻliq SAHIFA sifatida (prototip `Receipts` hujjat koʻrinishi): `/receipts/new`, `/receipts/[id]`.
 * Yopish — roʻyxatga; yangi kirim saqlanganda manzil `/receipts/<id>` ga almashadi.
 */
export function ReceiptDocumentPage({ id }: { id: number | null }) {
  const router = useRouter();
  return (
    <ReceiptDrawer
      frame="page"
      id={id}
      onClose={() => router.push("/receipts")}
      onCreated={(newId) => router.replace(`/receipts/${newId}`)}
    />
  );
}

export function ReceiptDrawer(props: { id: number | null; onClose: () => void; onCreated: (id: number) => void; frame?: "page" }) {
  const t = useTranslations("receipts.drawer");
  const tr = useTranslations("receipts");
  const tc = useTranslations("common");
  const doc = useReceipt(props.id);
  if (props.frame === "page" && props.id !== null && (doc.error || !doc.data))
    return (
      <div className="flex flex-col gap-4">
        <DocumentHeader
          parent={{ label: tr("list.title"), href: "/receipts" }}
          crumb={doc.error ? t("pageTitle") : tc("loading")}
          title={t("pageTitle")}
        />
        {doc.error ? <ErrorState onRetry={() => doc.refetch()} /> : <Skeleton className="h-40 w-full" />}
      </div>
    );
  if (props.id !== null && doc.error)
    return (
      <Drawer open onClose={props.onClose} size="lg" kind={t("kind")} title="KR">
        <ErrorState onRetry={() => doc.refetch()} />
      </Drawer>
    );
  if (props.id !== null && !doc.data)
    return (
      <Drawer open onClose={props.onClose} size="lg" kind={t("kind")} title={tc("loading")}>
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

function Editor({
  doc,
  onClose,
  onCreated,
  frame,
}: {
  doc: ReceiptDetail | null;
  onClose: () => void;
  onCreated: (id: number) => void;
  frame?: "page";
}) {
  const t = useTranslations("receipts.drawer");
  const tr = useTranslations("receipts");
  const dp = tr("datePlaceholder");
  const tcp = useTranslations("counterparties");
  const paymentTypes = PAYMENT_TYPE_VALUES.map((value) => ({ value, label: tcp(`paymentType.${value}`) }));
  const me = useMe();
  const router = useRouter();
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
  const editable = canCreate && (!doc || doc.status === "DRAFT") && (pricesVisible || !doc?.hasPrices);

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
  const [tab, setTab] = useState<"doc" | "history">("doc");
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
    if (!warehouse) return (setLocal(t("errors.warehouse")), null);
    if (!supplier) return (setLocal(t("errors.supplier")), null);
    const iso = parseUzDate(date);
    if (!iso) return (setLocal(t("errors.date")), null);
    const invIso = parseUzDate(invoiceDate);
    if (invIso === null) return (setLocal(t("errors.invoiceDate")), null);
    const dueIso = parseUzDate(due);
    if (dueIso === null) return (setLocal(t("errors.dueDate")), null);
    const discIso = parseUzDate(discountDate);
    if (discIso === null) return (setLocal(t("errors.discountDate")), null);
    const disc = discountKind ? parseMoneyInput(discountValue) : undefined;
    if (discountKind && !disc) return (setLocal(t("errors.discountValue")), null);
    const out: ReceiptRequest["lines"] = [];
    for (const [i, l] of lines.entries()) {
      const where = t("errors.where", { n: i + 1, name: l.productName });
      const expiry = parseUzDate(l.expiryDate);
      if (!expiry) return (setLocal(t("errors.lineExpiry", { where })), null);
      const produced = parseUzDate(l.producedOn);
      if (produced === null) return (setLocal(t("errors.lineProduced", { where })), null);
      if (!isInt(l.qty) || Number(l.qty) < 1) return (setLocal(t("errors.lineQty", { where })), null);
      if (l.bonusQty && !isInt(l.bonusQty)) return (setLocal(t("errors.lineBonus", { where })), null);
      const price = pricesVisible ? parseMoneyInput(l.price) : undefined;
      if (pricesVisible && l.price && !price) return (setLocal(t("errors.linePrice", { where })), null);
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
          toast({ tone: "success", title: t("draftSaved"), description: d.number });
          if (!doc) onCreated(d.id);
        },
      },
    );
  }

  function addLine() {
    const label = adding.product ? seen.current.get(adding.product) : undefined;
    if (!adding.product || !label) return setLocal(t("errors.product"));
    if (!adding.batch.trim()) return setLocal(t("errors.batch"));
    if (!parseUzDate(adding.expiry)) return setLocal(t("errors.expiry"));
    if (!adding.zone) return setLocal(t("errors.zone"));
    if (!isInt(adding.qty) || Number(adding.qty) < 1) return setLocal(t("errors.qty"));
    if (adding.bonus && !isInt(adding.bonus)) return setLocal(t("errors.bonus"));
    if (pricesVisible && adding.price && !parseMoneyInput(adding.price)) return setLocal(t("errors.price"));
    const key = `${adding.product}|${adding.batch.trim().toUpperCase()}`;
    if (lines.some((l) => `${l.productId}|${l.batchNumber.trim().toUpperCase()}` === key)) return setLocal(t("errors.duplicate"));
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
          {t("cancelDoc")}
        </Button>
      ) : null}
      <Button variant="secondary" onClick={onClose}>
        {t("back")}
      </Button>
      {editable ? (
        <Button variant={primaryIsAccept ? "secondary" : "primary"} loading={save.isPending} onClick={() => saveDraft()}>
          {t("saveDraft")}
        </Button>
      ) : null}
      {primaryIsAccept ? (
        <Button icon={ClipboardCheck} onClick={() => (editable ? saveDraft(() => setDialog("accept")) : setDialog("accept"))}>
          {t("accept")}
        </Button>
      ) : null}
      {doc?.status === "POSTED" && can(me.data, "qy.create") ? (
        <Button
          variant="secondary"
          icon={Undo2}
          onClick={() =>
            router.push(
              `/supplier-returns?receipt=${doc.id}&supplier=${doc.supplierId}&supplierName=${encodeURIComponent(doc.supplier)}&receiptNo=${encodeURIComponent(doc.number)}`,
            )
          }
        >
          {t("returnToSupplier")}
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
                  title: t("bonusConfirmed"),
                  description: `${d.bonusNumber ?? ""}${d.bonusAmount ? t("bonusToBalance", { amount: formatMoney(d.bonusAmount) }) : ""}`,
                }),
              () => undefined,
            )
          }
        >
          {t("bonusConfirmed")}
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
                  (d) => toast({ tone: "success", title: t("posted"), description: t("postedDescription", { number: d.number }) }),
                  () => undefined,
                )
          }
        >
          {t("post")}
        </Button>
      ) : null}
    </>
  );

  const content = (
    <div className="flex flex-col gap-4">
      <StatusNotes doc={doc} />
      {frame === "page" && !editable && doc ? <HeaderInfo doc={doc} /> : null}
      <div className={cn("grid grid-cols-3 gap-4", frame === "page" && !editable && doc && "hidden")}>
        <Select
          label={t("field.warehouse")}
          value={warehouseId}
          onChange={(v) => (setWarehouseId(v), setLines([]), setAdding(emptyAdd))}
          disabled={!editable || lines.length > 0}
          options={activeWarehouses.map((w) => ({ value: String(w.id), label: w.name }))}
          hint={editable && lines.length > 0 ? t("field.warehouseHint") : undefined}
          required
        />
        <Select
          label={t("field.supplier")}
          value={supplier}
          loadOptions={async (q) => {
            const found = await searchSuppliers(q);
            found.forEach((o) => seen.current.set(`s:${o.value}`, { code: o.sub, name: o.label }));
            return found;
          }}
          onChange={(v) => (setSupplier(v), setSupplierLabel(v ? (seen.current.get(`s:${v}`)?.name ?? "") : ""))}
          placeholder={supplierLabel || t("field.supplierPlaceholder")}
          options={supplier && supplierLabel ? [{ value: supplier, label: supplierLabel }] : []}
          disabled={!editable}
          required
          className="col-span-2"
        />
        <TextField label={t("field.date")} value={date} onChange={setDate} placeholder={dp} disabled={!editable} required />
        <TextField label={t("field.invoiceNumber")} value={invoice} onChange={setInvoice} disabled={!editable} />
        <TextField label={t("field.invoiceDate")} value={invoiceDate} onChange={setInvoiceDate} placeholder={dp} disabled={!editable} />
        <Select label={t("field.paymentType")} value={paymentType} onChange={setPaymentType} options={paymentTypes} disabled={!editable} />
        <TextField
          label={t("field.due")}
          value={prepaid || fromBonus ? "" : due}
          onChange={setDue}
          placeholder={doc?.dueDate && !doc.dueManual ? formatIsoDate(doc.dueDate) : dp}
          hint={t("field.dueHint")}
          disabled={!editable || prepaid || fromBonus}
        />
        <Select
          label={t("field.owner")}
          value={owner}
          onChange={setOwner}
          placeholder={t("field.ownerPlaceholder")}
          options={(employees.data ?? []).map((e) => ({ value: String(e.id), label: e.fullName, sub: e.roleName }))}
          disabled={!editable}
        />
        <Checkbox
          label={t("field.prepaid")}
          description={t("field.prepaidHint")}
          checked={prepaid}
          onChange={(v) => (setPrepaid(v), v && setFromBonus(false))}
          disabled={!editable}
        />
        <Checkbox
          label={t("field.fromBonus")}
          description={t("field.fromBonusHint")}
          checked={fromBonus}
          onChange={(v) => (setFromBonus(v), v && (setPrepaid(false), setDiscountKind(null)))}
          disabled={!editable}
        />
        <Select
          label={t("field.discount")}
          value={discountKind}
          onChange={setDiscountKind}
          placeholder={t("field.discountNone")}
          hint={fromBonus ? t("field.discountBonusHint") : undefined}
          options={[
            { value: "SUM", label: t("field.discountSum") },
            { value: "PERCENT", label: t("field.discountPercent") },
          ]}
          disabled={!editable || fromBonus}
        />
        <TextField
          label={t("field.discountValue")}
          value={discountValue}
          onChange={setDiscountValue}
          suffix={discountKind === "PERCENT" ? "%" : tr("sum")}
          inputMode="decimal"
          disabled={!editable || !discountKind}
        />
        <TextField
          label={t("field.discountDate")}
          value={discountDate}
          onChange={setDiscountDate}
          placeholder={dp}
          disabled={!editable || !discountKind}
        />
        <TextField label={t("field.note")} value={note} onChange={setNote} disabled={!editable} className="col-span-3" />
      </div>

      {editable && warehouse ? (
        <div className="grid grid-cols-4 items-end gap-3 rounded-card border border-border p-3">
          <Select
            label={t("field.product")}
            value={adding.product}
            loadOptions={async (q) => {
              const found = await searchProducts(q);
              found.forEach((o) => seen.current.set(o.value, { code: o.sub, name: o.label }));
              return found;
            }}
            onChange={(v) => setAdding((a) => ({ ...a, product: v }))}
            placeholder={t("field.productPlaceholder")}
            options={[]}
            className="col-span-3"
          />
          <Select
            label={t("field.zone")}
            value={adding.zone}
            onChange={(v) => setAdding((a) => ({ ...a, zone: v }))}
            options={zones.map((z) => ({ value: String(z.id), label: z.name, sub: zoneLabel(z.type) }))}
          />
          <TextField label={t("field.batch")} value={adding.batch} onChange={(v) => setAdding((a) => ({ ...a, batch: v }))} />
          <TextField
            label={t("field.produced")}
            value={adding.produced}
            onChange={(v) => setAdding((a) => ({ ...a, produced: v }))}
            placeholder={dp}
          />
          <TextField
            label={t("field.expiry")}
            value={adding.expiry}
            onChange={(v) => setAdding((a) => ({ ...a, expiry: v }))}
            placeholder={dp}
          />
          <TextField
            label={t("field.qty")}
            value={adding.qty}
            onChange={(v) => setAdding((a) => ({ ...a, qty: v }))}
            inputMode="numeric"
            suffix={tr("pcs")}
          />
          <TextField
            label={t("field.bonus")}
            value={adding.bonus}
            onChange={(v) => setAdding((a) => ({ ...a, bonus: v }))}
            inputMode="numeric"
            suffix={tr("pcs")}
            hint={t("field.bonusHint")}
          />
          {pricesVisible ? (
            <TextField
              label={t("field.price")}
              value={adding.price}
              onChange={(v) => setAdding((a) => ({ ...a, price: v }))}
              inputMode="decimal"
              suffix={tr("sum")}
              className="col-span-2"
            />
          ) : (
            <p className="col-span-2 text-caption text-text-secondary">{t("field.priceByPurchasing")}</p>
          )}
          <Button variant="secondary" onClick={addLine}>
            {t("addLine")}
          </Button>
        </div>
      ) : null}

      {local ? <Alert tone="danger" title={local} /> : null}
      {err.message ? <Alert tone="danger" title={err.message} /> : null}

      <div className="flex items-center justify-between gap-3">
        <h3 className="text-subtitle">
          {t("lines", { count: formatQuantity(lines.length) })}
          {pricesVisible && amount > 0n ? (
            <span className="ml-3 text-body font-normal text-text-secondary">{tr("amountSum", { amount: formatMoney(amountStr) })}</span>
          ) : null}
        </h3>
        {editable && warehouse ? (
          <Button variant="secondary" size="sm" icon={PackagePlus} onClick={() => setCatalogOpen(true)}>
            {t("addProduct")}
          </Button>
        ) : null}
      </div>
      <ReceiptLinesGrid
        lines={lines}
        server={doc?.lines ?? []}
        mode={editable ? "edit" : "read"}
        pricesVisible={pricesVisible}
        zones={zones}
        zoneName={zoneName}
        fromBonus={fromBonus}
        emptyText={editable ? (warehouse ? t("emptyEditable") : t("chooseWarehouse")) : t("empty")}
        onChange={(i, patch) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, ...patch } : x)))}
        onRemove={(i) => setLines((ls) => ls.filter((_, j) => j !== i))}
        onAdd={warehouse ? () => setCatalogOpen(true) : undefined}
      />
    </div>
  );
  const dialogs = (
    <>
      {catalogOpen && warehouse ? (
        <ReceiptCatalogDialog
          warehouseId={warehouse.id}
          supplierId={supplier ? Number(supplier) : null}
          zones={zones}
          defaultZone={adding.zone || null}
          pricesVisible={pricesVisible}
          existing={new Set(lines.map((l) => `${l.productId}|${l.batchNumber.trim().toUpperCase()}`))}
          header={[
            doc?.number ?? t("newTitle"),
            supplierLabel || t("noSupplier"),
            warehouse.name,
            t("lineCount", { count: formatQuantity(lines.length) }),
          ].join(" · ")}
          onClose={() => setCatalogOpen(false)}
          onAdd={(picked) => {
            setLines((ls) => [...ls, ...picked]);
            setCatalogOpen(false);
            setLocal(null);
            toast({ tone: "success", title: t("linesAdded", { count: formatQuantity(picked.length) }) });
          }}
        />
      ) : null}
      {dialog === "accept" && doc ? <AcceptDialog id={doc.id} onClose={() => setDialog(null)} /> : null}
      {dialog === "post" && doc ? <PostDialog doc={doc} onClose={() => setDialog(null)} /> : null}
      {dialog === "cancel" && doc ? (
        <DeactivateDialog
          title={t("cancelTitle", { number: doc.number })}
          consequence={doc.status === "POSTED" ? t("cancelPosted") : doc.status === "ACCEPTED" ? t("cancelAccepted") : t("cancelDraft")}
          actionLabel={t("cancelDoc")}
          pending={cancel.isPending}
          error={cancel.error}
          onClose={() => setDialog(null)}
          onConfirm={(reason) =>
            void cancel.mutateAsync({ id: doc.id, reason }).then(
              () => (toast({ tone: "success", title: t("cancelled"), description: doc.number }), setDialog(null)),
              () => undefined,
            )
          }
        />
      ) : null}
    </>
  );
  if (frame === "page")
    return (
      <div className="flex flex-col gap-4">
        <DocumentHeader
          parent={{ label: tr("list.title"), href: "/receipts" }}
          crumb={doc ? doc.number : t("newTitle")}
          crumbMono={doc !== null}
          title={doc ? t("pageTitle") : t("newTitle")}
          number={doc?.number}
          status={<ReceiptStatusBadge status={doc?.status ?? "DRAFT"} />}
          sub={
            doc ? (
              <>
                <span>{doc.supplier}</span>
                <span className="text-text-disabled">·</span>
                <span>{doc.warehouse}</span>
                <span className="text-text-disabled">·</span>
                <span className="tabular-nums">{day(doc.receiptDate)}</span>
                <span className="text-text-disabled">·</span>
                <span>{doc.createdBy}</span>
              </>
            ) : undefined
          }
          actions={actions}
        />
        {doc ? (
          <Tabs
            aria-label={t("pageTitle")}
            value={tab}
            onChange={(k) => setTab(k === "history" ? "history" : "doc")}
            items={[
              { key: "doc", label: t("tabDoc") },
              { key: "history", label: t("tabHistory") },
            ]}
          />
        ) : null}
        {tab === "history" && doc ? (
          <ReceiptHistory id={doc.id} />
        ) : (
          <>
            {doc && (doc.status === "ACCEPTED" || doc.status === "POSTED") ? <ReceiptCards doc={doc} /> : null}
            {doc ? <ReceiptPayment doc={doc} /> : null}
            {content}
          </>
        )}
        {dialogs}
      </div>
    );
  return (
    <Drawer
      open
      onClose={onClose}
      size="lg"
      kind={doc ? t("kindBy", { name: doc.createdBy }) : t("kind")}
      title={doc ? doc.number : t("newTitle")}
      subtitle={doc ? `${doc.supplier} · ${doc.warehouse}` : undefined}
      status={doc ? <ReceiptStatusBadge status={doc.status} /> : undefined}
      actions={actions}
    >
      {content}
      {dialogs}
    </Drawer>
  );
}

/** Oʻqish rejimidagi sarlavha (prototip `InfoGrid` «Hujjat maʼlumotlari»): ikki ustunli taʼrif roʻyxati. */
function HeaderInfo({ doc }: { doc: ReceiptDetail }) {
  const t = useTranslations("receipts.drawer");
  const tcp = useTranslations("counterparties");
  const at = (who?: string, when?: string) => (who ? `${who}${when ? ` · ${formatDateTime(new Date(when))}` : ""}` : null);
  const rows: { label: string; value: string | null; mono?: boolean }[] = [
    { label: t("field.warehouse"), value: doc.warehouse },
    { label: t("field.date"), value: day(doc.receiptDate) },
    { label: t("field.supplier"), value: doc.supplier },
    { label: t("field.invoiceNumber"), value: doc.invoiceNumber ?? null, mono: true },
    { label: t("field.invoiceDate"), value: doc.invoiceDate ? day(doc.invoiceDate) : null },
    { label: t("field.paymentType"), value: tcp(`paymentType.${doc.paymentType}`) },
    {
      label: t("field.due"),
      value: doc.fromBonus ? t("field.fromBonus") : doc.prepaid ? t("field.prepaid") : doc.dueDate ? day(doc.dueDate) : null,
    },
    { label: t("field.owner"), value: doc.owner ?? null },
    {
      label: t("field.discount"),
      value: doc.discountKind
        ? `${doc.discountKind === "PERCENT" ? `${doc.discountValue ?? ""} %` : formatMoney(doc.discountValue ?? "0")}${doc.discountDate ? ` · ${day(doc.discountDate)}` : ""}`
        : null,
    },
    { label: t("field.note"), value: doc.note ?? null },
    { label: t("info.created"), value: at(doc.createdBy, doc.createdAt) },
    { label: t("info.accepted"), value: at(doc.acceptedBy, doc.acceptedAt) },
    { label: t("info.posted"), value: at(doc.postedBy, doc.postedAt) },
  ];
  return (
    <section className="rounded-card border border-border bg-surface">
      <h3 className="border-b border-border px-5 py-3.5 font-semibold">{t("info.title")}</h3>
      <dl className="grid gap-x-6 px-5 py-1 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((r) => (
          <div key={r.label} className="flex flex-col gap-0.5 border-b border-border py-2.5">
            <dt className="text-caption text-text-secondary">{r.label}</dt>
            <dd className={r.mono && r.value ? "font-mono text-[13px]" : "[overflow-wrap:anywhere]"}>{r.value ?? "—"}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Qabul qilingan / oʻtkazilgan kirim kartalari (prototip): YB, hujjat summasi, qarz, toʻlov kuni, kutilayotgan bonus, bonus tovar. */
function ReceiptCards({ doc }: { doc: ReceiptDetail }) {
  const t = useTranslations("receipts.cards");
  const debt = doc.debtAmount ?? doc.actualAmount;
  const bonus = doc.bonusAmount ?? expectedBonus(doc);
  const cards: { label: string; value: string; sub?: string; tone?: "success" }[] = [
    { label: t("supplier"), value: doc.supplier },
    { label: t("docSum"), value: doc.amount ? formatMoney(doc.amount) : "—" },
    {
      label: t("debtSum"),
      value: debt ? formatMoney(debt) : "—",
      sub: doc.fromBonus ? t("fromBonus") : doc.prepaid ? t("prepaid") : undefined,
      tone: debt !== null && debt !== undefined && Number(debt) === 0 ? "success" : undefined,
    },
    {
      label: t("due"),
      value: doc.fromBonus || !doc.dueDate ? "—" : day(doc.dueDate),
      sub: doc.prepaid ? t("prepaid") : doc.dueManual ? t("dueManual") : undefined,
    },
    {
      label: t("bonus"),
      value: bonus ? formatMoney(bonus) : "—",
      sub: doc.bonusNumber ?? (doc.discountDate ? day(doc.discountDate) : undefined),
    },
    {
      label: t("bonusGoods"),
      value: doc.totalBonusQty ? t("pcs", { count: formatQuantity(doc.totalBonusQty) }) : "—",
      tone: doc.totalBonusQty ? "success" : undefined,
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {cards.map((c) => (
        <div key={c.label} className="flex min-w-0 flex-col gap-1 rounded-card border border-border bg-surface px-4 py-3">
          <span className="text-caption text-text-secondary">{c.label}</span>
          <span className={cn("truncate text-subtitle tabular-nums", c.tone === "success" && "text-success")} title={c.value}>
            {c.value}
          </span>
          {c.sub ? <span className="text-caption text-text-secondary">{c.sub}</span> : null}
        </div>
      ))}
    </div>
  );
}

/** Oʻtkazilgan kirim boʻyicha toʻlov: toʻlandi / qoldi / toʻlov kuni; ochiq boʻlsa — «Toʻlash» (YT). */
function ReceiptPayment({ doc }: { doc: ReceiptDetail }) {
  const t = useTranslations("receipts.payment");
  const me = useMe();
  const router = useRouter();
  if (doc.status !== "POSTED" || !doc.debtAmount || doc.openAmount == null || Number(doc.debtAmount) <= 0) return null;
  const left = toCentsBig(doc.openAmount) > 0n ? doc.openAmount : "0.00";
  const paidC = toCentsBig(doc.debtAmount) - toCentsBig(left);
  const paid = centsToMoney(paidC);
  const closed = toCentsBig(left) === 0n;
  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-body">
        <span className="inline-flex items-center gap-2 font-medium">
          <Wallet size={16} strokeWidth={1.5} aria-hidden />
          {t("title")}
        </span>
        <span>
          <span className="text-text-secondary">{t("paid")} </span>
          <span className="tabular-nums">{formatMoney(paid)}</span>
        </span>
        <span>
          <span className="text-text-secondary">{t("left")} </span>
          <span className="font-medium tabular-nums">{formatMoney(left)}</span>
        </span>
        {doc.dueDate && !closed ? <span className="text-text-secondary">{t("due", { date: day(doc.dueDate) })}</span> : null}
        {closed ? (
          <Badge tone="success" icon={CircleCheck}>
            {t("closed")}
          </Badge>
        ) : null}
      </div>
      {!closed && can(me.data, "payments.yt") ? (
        <Button
          variant="secondary"
          icon={ArrowUpRight}
          onClick={() =>
            router.push(
              `/payments?tab=yt&new=1&supplier=${doc.supplierId}&supplierName=${encodeURIComponent(doc.supplier)}&amount=${encodeURIComponent(left)}`,
            )
          }
        >
          {t("pay")}
        </Button>
      ) : null}
    </section>
  );
}

const HISTORY_ACTIONS = {
  "receipt.create": "create",
  "receipt.update": "update",
  "receipt.accept": "accept",
  "receipt.post": "post",
  "receipt.bonusConfirm": "bonusConfirm",
  "receipt.cancel": "cancel",
} as const;
const historyKey = (a: string) => (a in HISTORY_ACTIONS ? HISTORY_ACTIONS[a as keyof typeof HISTORY_ACTIONS] : null);

/** «Tarix» yorligʻi: audit jurnalidan, kunlar boʻyicha guruhlangan. */
function ReceiptHistory({ id }: { id: number }) {
  const t = useTranslations("receipts.history");
  const q = useReceiptHistory(id);
  return (
    <HistoryTimeline
      query={q}
      label={(a) => {
        const k = historyKey(a);
        return k ? t(`action.${k}`) : a;
      }}
    />
  );
}

function StatusNotes({ doc }: { doc: ReceiptDetail | null }) {
  const t = useTranslations("receipts.notes");
  if (!doc) return null;
  if (doc.status === "CANCELLED")
    return (
      <Alert tone="info" title={t("cancelled", { reason: doc.cancelReason ?? "" })}>
        {doc.cancelledBy}
      </Alert>
    );
  const short = prepaidShortfall(doc);
  const shortNote = short ? (
    <Alert tone="warning" title={t("prepaidShortTitle", { amount: formatMoney(short.shortfall) })}>
      {t("prepaidShortBody", { advance: formatMoney(short.advance), total: formatMoney(short.total) })}
    </Alert>
  ) : null;
  if (doc.status === "DRAFT") return shortNote;
  if (doc.status === "ACCEPTED")
    return (
      <>
        {shortNote}
        <Alert tone="warning" title={t("acceptedTitle")}>
          {t("acceptedBody", { name: doc.acceptedBy ?? "", at: doc.acceptedAt ? `, ${formatDateTime(new Date(doc.acceptedAt))}` : "" })}
        </Alert>
      </>
    );
  if (doc.status === "POSTED")
    return (
      <Alert tone="success" title={doc.debtAmount ? t("postedDebt", { amount: formatMoney(doc.debtAmount) }) : t("posted")}>
        {doc.prepaid ? t("prepaid") : doc.dueDate ? t("due", { date: day(doc.dueDate) }) : ""}
        {doc.supplierBalance ? t("supplierBalance", { amount: formatMoney(doc.supplierBalance) }) : ""}
        {doc.fromBonus ? t("fromBonus") : ""}
        {doc.bonusNumber
          ? t("bonus", {
              number: doc.bonusNumber,
              amount: doc.bonusAmount ? t("bonusAmount", { amount: formatMoney(doc.bonusAmount) }) : "",
            })
          : ""}
        {doc.bonusBalance ? t("bonusBalance", { amount: formatMoney(doc.bonusBalance) }) : ""}
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
  const t = useTranslations("receipts.accept");
  const tr = useTranslations("receipts");
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
      if (!isInt(r.received) || !isInt(r.damaged || "0")) return setLocal(t("lineQty", { n: l.lineNo }));
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
      (d) => (toast({ tone: "success", title: t("done"), description: t("doneDescription", { number: d.number }) }), onClose()),
      () => undefined,
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={t("title")}
      primaryAction={{ label: t("confirm"), loading: accept.isPending, onClick: submit }}
    >
      <div className="flex flex-col gap-3">
        <p className="text-text-secondary">{t("intro")}</p>
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
                  {t("inDoc", { batch: l.batchNumber, qty: formatQuantity(l.qty) })}
                  {l.bonusQty ? t("bonusPart", { qty: formatQuantity(l.bonusQty) }) : ""}
                </span>
              </div>
              <TextField
                label={t("good")}
                size="sm"
                value={r.received}
                onChange={(v) => set(l.id, r, { received: v })}
                inputMode="numeric"
              />
              <TextField
                label={t("damaged")}
                size="sm"
                value={r.damaged}
                onChange={(v) => set(l.id, r, { damaged: v })}
                inputMode="numeric"
              />
              <div className="flex flex-col gap-1">
                <span className="text-caption text-text-secondary">{t("reason")}</span>
                {expected ? (
                  <Badge tone={expected === "DAMAGED" ? "danger" : "warning"}>{tr(`diff.${expected}`)}</Badge>
                ) : (
                  <span className="text-text-secondary">{t("noDiff")}</span>
                )}
              </div>
              <Select
                label={t("zone")}
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
  const t = useTranslations("receipts.post");
  const tr = useTranslations("receipts");
  const td = useTranslations("receipts.drawer");
  const post = usePostReceipt();
  const [resolution, setResolution] = useState<Resolution>("ACTUAL");
  const err = describeError(post.error);
  const tn = useTranslations("receipts.notes");
  const short = prepaidShortfall(doc, resolution === "DOCUMENT" ? doc.amount : (doc.actualAmount ?? doc.amount));
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={t("title")}
      primaryAction={{
        label: t("submit"),
        loading: post.isPending,
        onClick: () =>
          void post.mutateAsync({ id: doc.id, resolution }).then(
            (d) => (toast({ tone: "success", title: td("posted"), description: td("postedDescription", { number: d.number }) }), onClose()),
            () => undefined,
          ),
      }}
    >
      <div className="flex flex-col gap-3">
        <p className="text-text-secondary">{t("intro")}</p>
        <Radio
          name="resolution"
          value="ACTUAL"
          label={t("actual")}
          description={doc.actualAmount ? tr("amountSum", { amount: formatMoney(doc.actualAmount) }) : t("actualHint")}
          checked={resolution === "ACTUAL"}
          onChange={() => setResolution("ACTUAL")}
        />
        <Radio
          name="resolution"
          value="DOCUMENT"
          label={t("document")}
          description={doc.amount ? tr("amountSum", { amount: formatMoney(doc.amount) }) : t("documentHint")}
          checked={resolution === "DOCUMENT"}
          onChange={() => setResolution("DOCUMENT")}
        />
        {short ? (
          <Alert tone="warning" title={tn("prepaidShortTitle", { amount: formatMoney(short.shortfall) })}>
            {tn("prepaidShortBody", { advance: formatMoney(short.advance), total: formatMoney(short.total) })}
          </Alert>
        ) : null}
        {err.message ? <Alert tone="danger" title={err.message} /> : null}
      </div>
    </Modal>
  );
}
