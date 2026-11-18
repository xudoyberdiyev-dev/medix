"use client";

import { Plus, Save, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DocumentHeader } from "@/components/ui/document-header";
import { Select } from "@/components/ui/select";
import { ErrorState, ForbiddenState, Skeleton } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { formatIsoDate, parseUzDate } from "@/features/counterparties/api";
import { useWarehouses } from "@/features/organization/api";
import { searchProducts } from "@/features/prices/api";
import { searchSuppliers } from "@/features/receipts/api";
import { describeError } from "@/features/setup/form-error";
import { formatMoney, formatQuantity } from "@/lib/format";
import {
  KK_CREATE,
  KK_PAYMENTS,
  centsToMoney,
  kkTotal,
  useExpectedReceipt,
  useSaveExpectedReceipt,
  type KkDetail,
  type KkPaymentKind,
  type KkRequest,
} from "./api";

interface FormLine {
  key: string;
  productId: number;
  name: string;
  code: string;
  qty: number;
  price: string;
  vat: string;
  batch: string;
  expiry: string;
}

/** Narxni koʻrish: tannarx huquqi bor yoki qabul qilmaydigan xodim (kirimdagidek). Ombor mudiri — yoʻq. */
export function kkPricesVisible(me: Parameters<typeof can>[0]): boolean {
  return can(me, "special.cost") || !can(me, "receipt.accept");
}

const MONEY_RE = /^\d{1,16}([.,]\d{1,2})?$/;

/** KK — yangi yoki qoralamani tahrirlash (toʻliq sahifa). */
export function KkFormPage({ id }: { id: number | null }) {
  const t = useTranslations("expectedReceipts");
  const me = useMe();
  const doc = useExpectedReceipt(id);
  if (me.data && !can(me.data, KK_CREATE)) return <ForbiddenState description={t("forbidden")} />;
  if (id !== null && doc.error) return <ErrorState error={doc.error} onRetry={() => doc.refetch()} />;
  if (id !== null && !doc.data) return <Skeleton className="h-64 w-full" />;
  return <Form doc={doc.data ?? null} />;
}

function Form({ doc }: { doc: KkDetail | null }) {
  const t = useTranslations("expectedReceipts");
  const tf = useTranslations("expectedReceipts.form");
  const me = useMe();
  const router = useRouter();
  const warehouses = useWarehouses();
  const save = useSaveExpectedReceipt();
  const prices = kkPricesVisible(me.data);
  const seen = useRef(new Map<string, { name: string; code: string }>());
  const [warehouseId, setWarehouseId] = useState(doc ? String(doc.warehouseId) : "");
  const [supplier, setSupplier] = useState(doc ? String(doc.supplierId) : "");
  const [supplierLabel, setSupplierLabel] = useState(doc?.supplier ?? "");
  const [waybill, setWaybill] = useState(doc?.waybillNumber ?? "");
  const [waybillDate, setWaybillDate] = useState(formatIsoDate(doc?.waybillDate));
  const [invoice, setInvoice] = useState(doc?.invoiceNumber ?? "");
  const [invoiceDate, setInvoiceDate] = useState(formatIsoDate(doc?.invoiceDate));
  const [contract, setContract] = useState(doc?.contract ?? "");
  const [payment, setPayment] = useState<KkPaymentKind>(doc?.paymentKind ?? "CREDIT");
  const [expected, setExpected] = useState(formatIsoDate(doc?.expectedDate));
  const [due, setDue] = useState(doc?.dueManual ? formatIsoDate(doc.dueDate) : "");
  const [note, setNote] = useState(doc?.note ?? "");
  const [lines, setLines] = useState<FormLine[]>(
    (doc?.lines ?? []).map((l) => ({
      key: String(l.id),
      productId: l.productId,
      name: l.productName,
      code: l.productCode,
      qty: l.qty,
      price: l.price ?? "",
      vat: l.vatRate != null ? String(l.vatRate) : "",
      batch: l.batchNumber ?? "",
      expiry: formatIsoDate(l.expiryDate),
    })),
  );
  const [adding, setAdding] = useState({ product: "", qty: "", price: "", vat: "", batch: "", expiry: "" });
  const [error, setError] = useState<string | null>(null);
  const dp = tf("datePlaceholder");

  const options = (warehouses.data ?? [])
    .filter((w) => w.active && (me.data?.allBranches || w.branchId === me.data?.branchId))
    .map((w) => ({ value: String(w.id), label: w.name }));
  const total = kkTotal(lines.map((l) => ({ qty: l.qty, price: l.price.replace(",", ".") })));

  const addLine = () => {
    const qty = Number(adding.qty);
    const meta = seen.current.get(adding.product);
    if (!adding.product || !meta) return setError(tf("errProduct"));
    if (!Number.isInteger(qty) || qty <= 0) return setError(tf("errQty"));
    if (prices && adding.price.trim() !== "" && !MONEY_RE.test(adding.price.trim())) return setError(tf("errPrice"));
    if (adding.expiry.trim() !== "" && !parseUzDate(adding.expiry)) return setError(tf("errDate"));
    setError(null);
    setLines((ls) => [
      ...ls,
      {
        key: `${adding.product}-${Date.now()}`,
        productId: Number(adding.product),
        name: meta.name,
        code: meta.code,
        qty,
        price: adding.price.trim().replace(",", "."),
        vat: adding.vat.trim(),
        batch: adding.batch.trim(),
        expiry: adding.expiry.trim(),
      },
    ]);
    setAdding({ product: "", qty: "", price: "", vat: "", batch: "", expiry: "" });
  };

  const submit = () => {
    const wd = parseUzDate(waybillDate);
    const id = parseUzDate(invoiceDate);
    const ed = parseUzDate(expected);
    const dd = parseUzDate(due);
    if (!warehouseId || !supplier || !waybill.trim() || !wd) return setError(tf("errRequired"));
    if (id === null || ed === null || dd === null) return setError(tf("errDate"));
    if (lines.length === 0) return setError(tf("errNoLines"));
    setError(null);
    const body: KkRequest = {
      warehouseId: Number(warehouseId),
      supplierId: Number(supplier),
      waybillNumber: waybill.trim(),
      waybillDate: wd,
      invoiceNumber: invoice.trim() || undefined,
      invoiceDate: id,
      contract: contract.trim() || undefined,
      paymentKind: payment,
      expectedDate: ed,
      dueDate: payment === "CREDIT" ? dd : undefined,
      note: note.trim() || undefined,
      lines: lines.map((l) => ({
        productId: l.productId,
        qty: l.qty,
        price: prices && l.price ? l.price : undefined,
        vatRate: l.vat === "" ? undefined : Number(l.vat),
        batchNumber: l.batch || undefined,
        expiryDate: parseUzDate(l.expiry) || undefined,
      })),
    };
    save.mutate(
      { id: doc?.id, body },
      {
        onSuccess: (d) => (
          toast({ tone: "success", title: tf("saved"), description: d.number }),
          router.replace(`/expected-receipts/${d.id}`)
        ),
        onError: (e) => setError(describeError(e).message ?? tf("failed")),
      },
    );
  };

  const columns: TableColumn<FormLine>[] = [
    {
      key: "name",
      title: t("col.product"),
      wrap: true,
      render: (l) => (
        <span className="flex flex-col">
          <span className="font-medium">{l.name}</span>
          <span className="font-mono text-caption text-text-secondary">{l.code}</span>
        </span>
      ),
    },
    { key: "qty", title: t("col.qty"), align: "right", render: (l) => formatQuantity(l.qty) },
    ...(prices
      ? [
          {
            key: "price",
            title: t("col.price"),
            align: "right" as const,
            render: (l: FormLine) => (l.price ? formatMoney(l.price) : "—"),
          },
        ]
      : []),
    { key: "vat", title: t("col.vat"), align: "right", render: (l) => (l.vat ? `${l.vat}%` : "—") },
    { key: "batch", title: t("col.batch"), mono: true, render: (l) => l.batch || "—" },
    { key: "expiry", title: t("col.expiry"), render: (l) => l.expiry || "—" },
    {
      key: "remove",
      title: "",
      align: "right",
      render: (l) => (
        <Button
          variant="icon"
          size="sm"
          icon={Trash2}
          aria-label={tf("remove")}
          onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
        />
      ),
    },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-4 pb-12">
      <DocumentHeader
        parent={{ label: t("listTitle"), href: "/expected-receipts" }}
        crumb={doc?.number ?? tf("newCrumb")}
        crumbMono={doc != null}
        title={doc ? t("kind") : tf("newTitle")}
        number={doc?.number}
        sub={tf("sub")}
        actions={
          <>
            <Button variant="secondary" onClick={() => router.push(doc ? `/expected-receipts/${doc.id}` : "/expected-receipts")}>
              {tf("cancel")}
            </Button>
            <Button icon={Save} loading={save.isPending} onClick={submit}>
              {tf("save")}
            </Button>
          </>
        }
      />
      {error ? <Alert tone="danger" title={error} /> : null}
      <section className="grid grid-cols-1 gap-4 rounded-card border border-border bg-surface p-5 md:grid-cols-3">
        <Select label={tf("warehouse")} value={warehouseId} onChange={(v) => setWarehouseId(v ?? "")} options={options} required />
        <Select
          label={tf("supplier")}
          value={supplier}
          loadOptions={async (q) => {
            const found = await searchSuppliers(q);
            found.forEach((o) => seen.current.set(`s:${o.value}`, { name: o.label, code: o.sub ?? "" }));
            return found;
          }}
          onChange={(v) => (setSupplier(v ?? ""), setSupplierLabel(v ? (seen.current.get(`s:${v}`)?.name ?? "") : ""))}
          placeholder={supplierLabel || tf("supplierPlaceholder")}
          options={supplier && supplierLabel ? [{ value: supplier, label: supplierLabel }] : []}
          required
        />
        <Select
          label={tf("payment")}
          value={payment}
          onChange={(v) => setPayment((v || "CREDIT") as KkPaymentKind)}
          options={KK_PAYMENTS.map((p) => ({ value: p, label: t(`payment.${p}`) }))}
          hint={payment === "CREDIT" ? tf("paymentCreditHint") : tf("paymentOtherHint")}
          required
        />
        <TextField label={tf("waybill")} value={waybill} onChange={setWaybill} placeholder="TTN-000123" required />
        <TextField variant="date" label={tf("waybillDate")} value={waybillDate} onChange={setWaybillDate} placeholder={dp} required />
        <TextField variant="date" label={tf("expected")} value={expected} onChange={setExpected} placeholder={dp} />
        <TextField label={tf("invoice")} value={invoice} onChange={setInvoice} />
        <TextField
          variant="date"
          label={tf("invoiceDate")}
          value={invoiceDate}
          onChange={setInvoiceDate}
          placeholder={dp}
          hint={payment === "CREDIT" ? tf("invoiceDateHint") : undefined}
        />
        <TextField label={tf("contract")} value={contract} onChange={setContract} />
        {payment === "CREDIT" ? (
          <TextField variant="date" label={tf("due")} value={due} onChange={setDue} placeholder={dp} hint={tf("dueHint")} />
        ) : null}
        <TextField label={tf("note")} value={note} onChange={setNote} className="md:col-span-2" />
      </section>

      <section className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5">
        <h2 className="text-subtitle">{tf("lines")}</h2>
        <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-6">
          <Select
            label={tf("product")}
            value={adding.product}
            loadOptions={async (q) => {
              const found = await searchProducts(q);
              found.forEach((o) => seen.current.set(o.value, { name: o.label, code: o.sub }));
              return found;
            }}
            onChange={(v) => setAdding((a) => ({ ...a, product: v ?? "" }))}
            placeholder={tf("productPlaceholder")}
            options={[]}
            className="md:col-span-2"
          />
          <TextField label={tf("qty")} value={adding.qty} onChange={(v) => setAdding((a) => ({ ...a, qty: v }))} inputMode="numeric" />
          {prices ? (
            <TextField label={tf("price")} variant="amount" value={adding.price} onChange={(v) => setAdding((a) => ({ ...a, price: v }))} />
          ) : null}
          <TextField label={tf("vat")} value={adding.vat} onChange={(v) => setAdding((a) => ({ ...a, vat: v }))} inputMode="numeric" />
          <TextField label={tf("batch")} value={adding.batch} onChange={(v) => setAdding((a) => ({ ...a, batch: v }))} />
          <TextField
            variant="date"
            label={tf("expiry")}
            value={adding.expiry}
            onChange={(v) => setAdding((a) => ({ ...a, expiry: v }))}
            placeholder={dp}
          />
          <Button variant="secondary" icon={Plus} onClick={addLine}>
            {tf("add")}
          </Button>
        </div>
        {!prices ? <Alert tone="info" title={tf("pricesHidden")} /> : null}
        <Table caption={tf("lines")} density="compact" columns={columns} rows={lines} rowKey={(l) => l.key} />
        {prices && lines.length > 0 ? (
          <p className="text-right text-body">
            {tf("total")}: <span className="font-semibold tabular-nums">{formatMoney(centsToMoney(total.cents))}</span>
            {total.missing ? <span className="ml-2 text-text-secondary">{tf("totalMissing")}</span> : null}
          </p>
        ) : null}
      </section>
    </div>
  );
}
