"use client";

import { Check, Gift, Printer, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DocumentHeader } from "@/components/ui/document-header";
import { Drawer } from "@/components/ui/drawer";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { ZONE_LABELS, zoneLabel as zoneTypeLabel } from "@/features/organization/api";
import { searchSuppliers, useReceipts } from "@/features/receipts/api";
import { describeError } from "@/features/setup/form-error";
import { useLineErrorText } from "@/features/zone-transfers/line-error";
import { formatDate, formatDateTime, formatMoney, formatQuantity } from "@/lib/format";
import { useBranchStore } from "@/lib/stores/branch";
import {
  QY_APPROVE,
  QY_REASONS,
  returnLinesFrom,
  useApproveSupplierReturn,
  useCreateSupplierReturn,
  useRejectSupplierReturn,
  useReturnStock,
  useSupplierReturn,
  zonesOf,
  type ReturnStockRow,
  type SupplierReturnDetail,
  type SupplierReturnReason,
} from "./api";
import { SupplierReturnStatusBadge } from "./supplier-returns-page";

const day = (iso: string) => formatDate(new Date(`${iso}T00:00:00+05:00`));
const zoneLabel = (z: { name: string; type: string }) => {
  const type = z.type as keyof typeof ZONE_LABELS;
  const t = ZONE_LABELS[type];
  return !t || z.name === t ? z.name : `${z.name} · ${zoneTypeLabel(type)}`;
};

export function BonusBadge() {
  const t = useTranslations("supplierReturns");
  return (
    <Badge tone="info" icon={Gift}>
      {t("bonus")}
    </Badge>
  );
}

/** Kirim hujjatidan ochilganda: kirim va yetkazib beruvchi oldindan tanlangan. */
export interface ReturnPreset {
  receiptId: number;
  receiptNo: string;
  supplierId: number;
  supplierName: string;
}

export function SupplierReturnDrawer(props: {
  id: number | null;
  preset?: ReturnPreset;
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const t = useTranslations("supplierReturns");
  const tc = useTranslations("common");
  const doc = useSupplierReturn(props.id);
  if (props.id === null) return <CreateForm preset={props.preset} onClose={props.onClose} onCreated={props.onCreated} />;
  if (doc.error)
    return (
      <Drawer open onClose={props.onClose} size="lg" kind={t("kind")} title="QY">
        <ErrorState onRetry={() => doc.refetch()} />
      </Drawer>
    );
  if (!doc.data)
    return (
      <Drawer open onClose={props.onClose} size="lg" kind={t("kind")} title={tc("loading")}>
        <Skeleton className="h-40 w-full" />
      </Drawer>
    );
  return <View doc={doc.data} onClose={props.onClose} />;
}

function View({ doc, onClose }: { doc: SupplierReturnDetail; onClose: () => void }) {
  const t = useTranslations("supplierReturns");
  const me = useMe();
  const approve = useApproveSupplierReturn();
  const reject = useRejectSupplierReturn();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const canDecide = doc.status === "PENDING" && can(me.data, QY_APPROVE);
  const withAmount = doc.totalAmount != null;
  type Line = SupplierReturnDetail["lines"][number];
  const columns: TableColumn<Line>[] = [
    { key: "productCode", title: t("col.code"), mono: true },
    {
      key: "productName",
      title: t("col.product"),
      wrap: true,
      render: (l) => (
        <span className="flex items-center gap-2">
          {l.productName}
          {l.bonus ? <BonusBadge /> : null}
        </span>
      ),
    },
    { key: "batchNumber", title: t("col.batch"), mono: true },
    { key: "expiryDate", title: t("col.expiry"), render: (l) => day(l.expiryDate) },
    { key: "qty", title: t("col.count"), align: "right", render: (l) => formatQuantity(l.qty) },
    ...(withAmount
      ? [
          {
            key: "price",
            title: t("col.price"),
            align: "right" as const,
            render: (l: Line) => (l.price != null ? formatMoney(l.price) : "—"),
          },
          {
            key: "amount",
            title: t("col.amount"),
            align: "right" as const,
            render: (l: Line) => (l.amount != null ? formatMoney(l.amount) : "—"),
          },
        ]
      : []),
  ];
  const fail = (e: unknown) => toast({ tone: "danger", title: t("failed"), description: describeError(e).message ?? t("retryHint") });
  return (
    <Drawer
      open
      onClose={onClose}
      size="lg"
      kind={`${t("kind")} · ${doc.createdBy}`}
      title={doc.number}
      subtitle={formatDateTime(new Date(doc.createdAt))}
      status={<SupplierReturnStatusBadge status={doc.status} />}
      actions={
        <>
          <Button
            variant="tertiary"
            icon={Printer}
            onClick={() => window.open(`/api/supplier-returns/${doc.id}/pdf`, "_blank", "noopener")}
          >
            {t("view.print")}
          </Button>
          {canDecide ? (
            <>
              <Button variant="secondary" icon={X} onClick={() => setRejecting(true)}>
                {t("view.reject")}
              </Button>
              <Button
                icon={Check}
                loading={approve.isPending}
                onClick={() =>
                  approve.mutate(doc.id, {
                    onSuccess: (d) => toast({ tone: "success", title: t("view.approved"), description: d.number }),
                    onError: fail,
                  })
                }
              >
                {t("view.approve")}
              </Button>
            </>
          ) : null}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {doc.status === "PENDING" ? (
          <Alert tone="warning" title={t("view.pendingTitle")}>
            {t("view.pendingBody", { zone: doc.zone.name })}
          </Alert>
        ) : null}
        {doc.status === "REJECTED" ? (
          <Alert tone="info" title={t("view.rejectedTitle", { reason: doc.rejectReason ?? "" })}>
            {t("view.rejectedBody", { who: doc.rejectedBy ?? "" })}
          </Alert>
        ) : null}
        <dl className="grid grid-cols-3 gap-4 text-body">
          <div className="col-span-2">
            <dt className="text-caption text-text-secondary">{t("view.supplier")}</dt>
            <dd>{doc.supplier}</dd>
          </div>
          <div>
            <dt className="text-caption text-text-secondary">{t("view.receipt")}</dt>
            <dd>
              <span className="font-mono">{doc.receiptNumber}</span> · {day(doc.receiptDate)}
            </dd>
          </div>
          <div>
            <dt className="text-caption text-text-secondary">{t("view.warehouseZone")}</dt>
            <dd>
              {doc.warehouse} · {doc.zone.name}
            </dd>
          </div>
          <div>
            <dt className="text-caption text-text-secondary">{t("view.reason")}</dt>
            <dd>{t(`reason.${doc.reason}`)}</dd>
          </div>
          <div>
            <dt className="text-caption text-text-secondary">{t("view.settlement")}</dt>
            <dd>{doc.fromBonus ? t("view.fromBonus") : t("view.debt")}</dd>
          </div>
          {doc.note ? (
            <div className="col-span-3">
              <dt className="text-caption text-text-secondary">{t("view.note")}</dt>
              <dd>{doc.note}</dd>
            </div>
          ) : null}
          {doc.postedBy ? (
            <div className="col-span-3">
              <dt className="text-caption text-text-secondary">{t("view.postedBy")}</dt>
              <dd>
                {doc.postedBy}
                {doc.postedAt ? ` · ${formatDateTime(new Date(doc.postedAt))}` : ""}
              </dd>
            </div>
          ) : null}
        </dl>
        <Table caption={t("view.linesCaption")} density="compact" columns={columns} rows={doc.lines} rowKey={(l) => String(l.id)} />
        <p className="text-right text-caption text-text-secondary">
          {t("view.total", { qty: formatQuantity(doc.totalQty) })}
          {doc.totalAmount != null ? ` · ${t("view.totalAmount", { amount: formatMoney(doc.totalAmount) })}` : ""}
        </p>
      </div>
      <Modal
        open={rejecting}
        onClose={() => setRejecting(false)}
        title={t("view.rejectTitle")}
        tone="danger"
        primaryAction={{
          label: t("view.reject"),
          loading: reject.isPending,
          disabled: reason.trim() === "",
          onClick: () =>
            reject.mutate(
              { id: doc.id, reason: reason.trim() },
              { onSuccess: () => (setRejecting(false), toast({ tone: "success", title: t("view.rejected") })), onError: fail },
            ),
        }}
      >
        <TextField label={t("view.rejectReason")} value={reason} onChange={setReason} placeholder={t("view.rejectPlaceholder")} required />
      </Modal>
    </Drawer>
  );
}

export function CreateForm({
  preset,
  onClose,
  onCreated,
  page = false,
}: {
  preset?: ReturnPreset;
  onClose: () => void;
  onCreated: (id: number) => void;
  /** Toʻliq sahifa (prototip `StockDocs`, kind = qy, yangi hujjat). */
  page?: boolean;
}) {
  const t = useTranslations("supplierReturns");
  const lineError = useLineErrorText();
  const me = useMe();
  const selectedBranch = useBranchStore((s) => s.branchId);
  const create = useCreateSupplierReturn();
  const seen = useRef(new Map<string, string>());
  const [supplier, setSupplier] = useState<string | null>(preset ? String(preset.supplierId) : null);
  const [supplierLabel, setSupplierLabel] = useState(preset?.supplierName ?? "");
  const [receiptId, setReceiptId] = useState<string | null>(preset ? String(preset.receiptId) : null);
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [reason, setReason] = useState<SupplierReturnReason | null>(null);
  const [note, setNote] = useState("");
  const [qty, setQty] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const branchId = me.data?.allBranches ? (selectedBranch ?? null) : null;
  const receipts = useReceipts(branchId, "POSTED", 1, supplier !== null, supplier ? Number(supplier) : null);
  const stock = useReturnStock(receiptId ? Number(receiptId) : null);

  const canApprove = can(me.data, QY_APPROVE);
  const receiptOptions = (receipts.data?.items ?? []).map((r) => ({
    value: String(r.id),
    label: `${r.number} · ${day(r.receiptDate)}`,
    sub: r.invoiceNumber ? t("form.invoice", { number: r.invoiceNumber }) : r.warehouse,
  }));
  // Oldindan tanlangan kirim roʻyxatning birinchi sahifasida boʻlmasa ham koʻrinsin
  if (preset && String(preset.receiptId) === receiptId && !receiptOptions.some((o) => o.value === receiptId))
    receiptOptions.unshift({ value: receiptId, label: preset.receiptNo, sub: "" });
  const all = stock.data ?? [];
  const zones = zonesOf(all);
  const zone = zones.find((z) => String(z.id) === zoneId) ?? (zones.length === 1 ? zones[0] : undefined);
  const rows = zone ? all.filter((r) => r.zone.id === zone.id) : [];
  const picked = returnLinesFrom(rows, qty);
  const withPrice = rows.some((r) => r.price != null);

  const columns: TableColumn<ReturnStockRow>[] = [
    {
      key: "productName",
      title: t("col.product"),
      wrap: true,
      render: (r) => (
        <span className="flex items-center gap-2">
          {r.productName}
          {r.bonus ? <BonusBadge /> : null}
        </span>
      ),
    },
    { key: "batchNumber", title: t("col.batch"), mono: true },
    { key: "expiryDate", title: t("col.expiry"), render: (r) => day(r.expiryDate) },
    ...(withPrice
      ? [
          {
            key: "price",
            title: t("col.price"),
            align: "right" as const,
            render: (r: ReturnStockRow) => (r.price != null ? formatMoney(r.price) : "—"),
          },
        ]
      : []),
    {
      key: "free",
      title: t("col.free"),
      align: "right",
      render: (r) => (
        <span className="flex flex-col items-end">
          {formatQuantity(r.free)}
          {r.reserved ? (
            <span className="text-caption text-text-secondary">{t("reservedQty", { qty: formatQuantity(r.reserved) })}</span>
          ) : null}
        </span>
      ),
    },
    {
      key: "ret",
      title: t("col.ret"),
      align: "right",
      render: (r) => (
        <div className="ml-auto w-20">
          <TextField
            label={t("form.qtyLabel", { product: r.productName, batch: r.batchNumber })}
            className="[&>label]:sr-only"
            value={qty[r.batchId] ?? ""}
            onChange={(v) => (setQty((q) => ({ ...q, [r.batchId]: v })), setError(null))}
            placeholder={r.free > 0 ? `≤ ${r.free}` : "0"}
            disabled={r.free === 0}
            inputMode="numeric"
          />
        </div>
      ),
    },
  ];

  const submit = () => {
    if (!receiptId) return setError(t("form.pickReceipt"));
    if (!zone) return setError(t("form.pickZone"));
    if (!reason) return setError(t("form.pickReason"));
    if (reason === "OTHER" && note.trim() === "") return setError(t("form.otherNote"));
    if (picked.error) return setError(lineError(picked.error));
    if (picked.lines.length === 0) return setError(t("form.noLines"));
    create.mutate(
      { receiptId: Number(receiptId), zoneId: zone.id, reason, note: note.trim(), lines: picked.lines },
      {
        onSuccess: (d) => {
          toast({
            tone: "success",
            title: d.status === "PENDING" ? t("form.sent") : t("form.done"),
            description: d.number,
          });
          onCreated(d.id);
        },
        onError: (e) => setError(describeError(e).message ?? t("saveFailed")),
      },
    );
  };

  const action = (
    <Button icon={Check} loading={create.isPending} onClick={submit} disabled={!receiptId || !zone || !reason}>
      {canApprove ? t("form.submit") : t("form.sendForApproval")}
    </Button>
  );
  const body = (
    <div className="flex flex-col gap-4">
      {error ? (
        <Alert tone="danger" title={t("form.errorTitle")}>
          {error}
        </Alert>
      ) : null}
      <div className="grid grid-cols-2 gap-4">
        <Select
          label={t("form.supplier")}
          value={supplier}
          loadOptions={async (q) => {
            const found = await searchSuppliers(q);
            found.forEach((o) => seen.current.set(o.value, o.label));
            return found;
          }}
          onChange={(v) => (
            setSupplier(v),
            setSupplierLabel(v ? (seen.current.get(v) ?? "") : ""),
            setReceiptId(null),
            setZoneId(null),
            setQty({})
          )}
          placeholder={supplierLabel || t("form.supplierPlaceholder")}
          options={supplier && supplierLabel ? [{ value: supplier, label: supplierLabel }] : []}
          required
        />
        <Select
          label={t("form.receipt")}
          value={receiptId}
          onChange={(v) => (setReceiptId(v), setZoneId(null), setQty({}))}
          options={receiptOptions}
          placeholder={supplier ? t("form.receiptPlaceholder") : t("form.receiptFirst")}
          disabled={!supplier}
          required
        />
        <Select
          label={t("form.zone")}
          value={zone ? String(zone.id) : null}
          onChange={(v) => (setZoneId(v), setQty({}))}
          options={zones.map((z) => ({ value: String(z.id), label: zoneLabel(z) }))}
          disabled={zones.length === 0}
          hint={receiptId && stock.data && zones.length === 0 ? t("form.noStock") : undefined}
          required
        />
        <Select
          label={t("form.reason")}
          value={reason}
          onChange={(v) => setReason(v as SupplierReturnReason | null)}
          options={QY_REASONS.map((value) => ({ value, label: t(`reason.${value}`) }))}
          required
        />
      </div>
      <Alert tone="info" title={canApprove ? t("form.selfApproveTitle") : t("form.needApprovalTitle")}>
        {canApprove ? t("form.selfApproveBody") : t("form.needApprovalBody")}
      </Alert>
      {receiptId ? (
        stock.error ? (
          <ErrorState onRetry={() => stock.refetch()} />
        ) : zone || stock.isPending ? (
          <Table
            caption={zone ? t("form.stockCaption", { zone: zone.name }) : t("form.stockCaptionAll")}
            density="compact"
            columns={columns}
            rows={rows}
            rowKey={(r) => String(r.batchId)}
            loading={stock.isPending}
            emptyState={<EmptyState icon={X} title={t("form.emptyZoneTitle")} description={t("form.emptyZoneHint")} />}
          />
        ) : zones.length > 1 ? (
          <Alert tone="info" title={t("form.pickZoneTitle")}>
            {t("form.pickZoneBody")}
          </Alert>
        ) : null
      ) : null}
      <TextField
        label={t("form.note")}
        value={note}
        onChange={setNote}
        placeholder={t("form.notePlaceholder")}
        required={reason === "OTHER"}
      />
    </div>
  );
  if (page)
    return (
      <div className="flex min-w-0 flex-col gap-4 pb-12">
        <DocumentHeader
          parent={{ label: t("doc.parent"), href: "/supplier-returns" }}
          crumb={t("doc.crumbNew")}
          title={t("form.title")}
          actions={action}
        />
        <section className="rounded-card border border-border bg-surface p-5">{body}</section>
      </div>
    );
  return (
    <Drawer open onClose={onClose} size="lg" kind={t("kind")} title={t("form.title")} actions={action}>
      {body}
    </Drawer>
  );
}
