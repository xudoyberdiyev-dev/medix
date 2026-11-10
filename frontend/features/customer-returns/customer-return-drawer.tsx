"use client";

import { Check, HandCoins, Link2, Lock, Send, ShieldAlert, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { searchCustomers } from "@/features/orders/api";
import { describeError } from "@/features/setup/form-error";
import { formatDate, formatDateTime, formatMoney, formatQuantity } from "@/lib/format";
import { useBranchStore } from "@/lib/stores/branch";
import {
  QM_APPROVE,
  useApproveCustomerReturn,
  useCreateCustomerReturn,
  useCustomerReturn,
  useRejectCustomerReturn,
  useReturnableLines,
  useReturnableSales,
  type CustomerReturnDetail,
  type ReturnableLine,
} from "./api";
import { CustomerReturnStatusBadge } from "./customer-returns-page";
import { QM_REASONS, qmLinesFrom, qmTotal, type QmLineError, type QmReason } from "./model";

const day = (iso: string) => formatDate(new Date(`${iso}T00:00:00+05:00`));

function QuarantineCell() {
  const t = useTranslations("customerReturns");
  return (
    <span className="inline-flex items-center gap-1 text-warning" title={t("zoneTip")}>
      <ShieldAlert size={14} strokeWidth={1.5} aria-hidden />
      {t("quarantine")}
      <Lock size={12} strokeWidth={1.5} aria-hidden />
    </span>
  );
}

export function CustomerReturnDrawer(props: { id: number | null; onClose: () => void; onCreated: (id: number) => void }) {
  const t = useTranslations("customerReturns");
  const tc = useTranslations("common");
  const doc = useCustomerReturn(props.id);
  if (props.id === null) return <CreateForm onClose={props.onClose} onCreated={props.onCreated} />;
  if (doc.error)
    return (
      <Drawer open onClose={props.onClose} size="lg" kind={t("kind")} title="QM">
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

function View({ doc, onClose }: { doc: CustomerReturnDetail; onClose: () => void }) {
  const t = useTranslations("customerReturns");
  const me = useMe();
  const approve = useApproveCustomerReturn();
  const reject = useRejectCustomerReturn();
  const [confirming, setConfirming] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const canDecide = doc.status === "PENDING" && can(me.data, QM_APPROVE);
  type Line = CustomerReturnDetail["lines"][number];
  const columns: TableColumn<Line>[] = [
    { key: "productName", title: t("col.product"), wrap: true },
    { key: "batchNumber", title: t("col.batch"), mono: true },
    { key: "expiryDate", title: t("col.expiry"), render: (l) => day(l.expiryDate) },
    { key: "qty", title: t("col.qty"), align: "right", render: (l) => formatQuantity(l.qty) },
    { key: "price", title: t("col.price"), align: "right", render: (l) => formatMoney(l.price) },
    { key: "amount", title: t("col.sum"), align: "right", render: (l) => formatMoney(l.amount) },
    { key: "reason", title: t("col.reason"), render: (l) => t(`reason.${l.reason}`) },
    { key: "zone", title: t("col.zone"), render: () => <QuarantineCell /> },
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
      status={<CustomerReturnStatusBadge status={doc.status} />}
      actions={
        canDecide ? (
          <>
            <Button variant="secondary" icon={X} onClick={() => setRejecting(true)}>
              {t("view.reject")}
            </Button>
            <Button icon={Check} onClick={() => setConfirming(true)}>
              {t("accept")}
            </Button>
          </>
        ) : null
      }
    >
      <div className="flex flex-col gap-4">
        {doc.status === "PENDING" ? (
          <Alert tone="warning" title={t("view.pendingTitle")}>
            {t("view.pendingBody")}
          </Alert>
        ) : null}
        {doc.status === "POSTED" ? (
          <Alert tone="success" title={t("view.postedTitle", { who: doc.postedBy ?? "" })}>
            {t("view.postedBody", {
              at: doc.postedAt ? formatDateTime(new Date(doc.postedAt)) : "",
              zone: doc.quarantineZone ?? t("quarantine"),
            })}
          </Alert>
        ) : null}
        {doc.status === "REJECTED" ? (
          <Alert tone="info" title={t("view.rejectedTitle", { reason: doc.rejectReason ?? "" })}>
            {t("view.rejectedBody", { who: doc.rejectedBy ?? "" })}
          </Alert>
        ) : null}
        <dl className="grid grid-cols-3 gap-4 text-body">
          <div>
            <dt className="text-caption text-text-secondary">{t("head.customer")}</dt>
            <dd>{doc.customer}</dd>
          </div>
          <div>
            <dt className="text-caption text-text-secondary">{t("head.sale")}</dt>
            <dd>
              <span className="font-mono">{doc.saleNumber}</span> · {day(doc.saleDate)}
            </dd>
          </div>
          <div>
            <dt className="text-caption text-text-secondary">{t("head.date")}</dt>
            <dd>{day(doc.returnDate)}</dd>
          </div>
          <div>
            <dt className="text-caption text-text-secondary">{t("head.warehouse")}</dt>
            <dd>{doc.warehouse}</dd>
          </div>
          <div>
            <dt className="text-caption text-text-secondary">{t("col.createdBy")}</dt>
            <dd>{doc.createdBy}</dd>
          </div>
          {doc.note ? (
            <div className="col-span-3">
              <dt className="text-caption text-text-secondary">{t("head.note")}</dt>
              <dd>{doc.note}</dd>
            </div>
          ) : null}
        </dl>
        <Table caption={t("view.linesCaption")} density="compact" columns={columns} rows={doc.lines} rowKey={(l) => String(l.id)} />
        <p className="text-right text-body">
          {t("totals", { lines: formatQuantity(doc.lines.length), qty: formatQuantity(doc.totalQty) })}{" "}
          <span className="font-semibold">{t("totalSum", { sum: formatMoney(doc.total) })}</span>
        </p>
      </div>
      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title={t("postTitle")}
        primaryAction={{
          label: t("accept"),
          loading: approve.isPending,
          onClick: () =>
            approve.mutate(doc.id, {
              onSuccess: (d) => (setConfirming(false), toast({ tone: "success", title: t("posted", { n: d.number }) })),
              onError: fail,
            }),
        }}
      >
        <ul className="flex flex-col gap-3 text-body">
          <li className="flex gap-2">
            <ShieldAlert size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-warning" aria-hidden />
            {t("confirm.quarantine", {
              lines: formatQuantity(doc.lines.length),
              qty: formatQuantity(doc.totalQty),
              wh: doc.warehouse,
            })}
          </li>
          <li className="flex gap-2">
            <HandCoins size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-text-secondary" aria-hidden />
            {t("confirm.debt", { customer: doc.customer, sum: formatMoney(doc.total) })}
          </li>
          <li className="flex gap-2">
            <Link2 size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-text-secondary" aria-hidden />
            {t("confirm.link", { n: doc.saleNumber })}
          </li>
        </ul>
      </Modal>
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

function CreateForm({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const t = useTranslations("customerReturns");
  const me = useMe();
  const selectedBranch = useBranchStore((s) => s.branchId);
  const create = useCreateCustomerReturn();
  const seen = useRef(new Map<string, string>());
  const [customer, setCustomer] = useState<string | null>(null);
  const [customerLabel, setCustomerLabel] = useState("");
  const [saleId, setSaleId] = useState<string | null>(null);
  const [qty, setQty] = useState<Record<number, string>>({});
  const [reasons, setReasons] = useState<Record<number, QmReason | undefined>>({});
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const branchId = me.data?.allBranches ? (selectedBranch ?? null) : null;
  const sales = useReturnableSales(customer ? Number(customer) : null, branchId);
  const lines = useReturnableLines(saleId ? Number(saleId) : null);
  const canApprove = can(me.data, QM_APPROVE);

  const sale = (sales.data ?? []).find((s) => String(s.id) === saleId);
  const rows = lines.data ?? [];
  const picked = qmLinesFrom(rows, { qty, reason: reasons });
  const total = qmTotal(rows, qty);
  const pickedQty = picked.lines.reduce((a, l) => a + l.qty, 0);
  const errText = (e: QmLineError) =>
    e.kind === "left"
      ? `${e.line}. ${e.product}: ${t("err.left", { n: formatQuantity(e.left) })}`
      : `${e.line}. ${e.product}: ${t(e.kind === "qty" ? "err.qty" : "err.reason")}`;
  const otherNote = picked.lines.some((l) => l.reason === "OTHER") && note.trim() === "";
  const errors = [
    ...(customer ? [] : [t("err.customer")]),
    ...(saleId ? [] : [t("err.sale")]),
    ...picked.errors.map(errText),
    ...(saleId && picked.errors.length === 0 && picked.lines.length === 0 ? [t("err.noLines")] : []),
    ...(otherNote ? [t("err.otherNote")] : []),
  ];

  const columns: TableColumn<ReturnableLine>[] = [
    { key: "productName", title: t("col.product"), wrap: true },
    { key: "batchNumber", title: t("col.batch"), mono: true },
    { key: "expiryDate", title: t("col.expiry"), render: (r) => day(r.expiryDate) },
    { key: "sold", title: t("col.sold"), align: "right", render: (r) => formatQuantity(r.sold) },
    { key: "returned", title: t("col.prior"), align: "right", render: (r) => formatQuantity(r.returned) },
    { key: "price", title: t("col.price"), align: "right", render: (r) => formatMoney(r.price) },
    {
      key: "qty",
      title: t("col.qty"),
      align: "right",
      render: (r) => (
        <div className="ml-auto w-20">
          <TextField
            label={t("qtyLabel", { product: r.productName, batch: r.batchNumber })}
            className="[&>label]:sr-only"
            value={qty[r.saleLineId] ?? ""}
            onChange={(v) => (setQty((q) => ({ ...q, [r.saleLineId]: v })), setError(null))}
            placeholder={r.left > 0 ? `≤ ${r.left}` : "0"}
            disabled={r.left === 0}
            inputMode="numeric"
          />
        </div>
      ),
    },
    {
      key: "reason",
      title: t("col.reason"),
      render: (r) => (
        <div className="w-44">
          <Select
            label={t("reasonLabel", { product: r.productName })}
            size="sm"
            className="[&>span:first-child]:sr-only"
            value={reasons[r.saleLineId] ?? null}
            onChange={(v) => setReasons((x) => ({ ...x, [r.saleLineId]: (v as QmReason | null) ?? undefined }))}
            placeholder={t("choose")}
            disabled={r.left === 0}
            options={QM_REASONS.map((value) => ({ value, label: t(`reason.${value}`) }))}
          />
        </div>
      ),
    },
    { key: "zone", title: t("col.zone"), render: () => <QuarantineCell /> },
  ];

  const submit = () => {
    setTried(true);
    if (errors.length > 0 || !saleId) return;
    create.mutate(
      { saleId: Number(saleId), note: note.trim(), lines: picked.lines },
      {
        onSuccess: (d) => {
          toast({ tone: "success", title: d.status === "PENDING" ? t("sent") : t("posted", { n: d.number }), description: d.number });
          onCreated(d.id);
        },
        onError: (e) => setError(describeError(e).message ?? t("saveFailed")),
      },
    );
  };

  return (
    <Drawer
      open
      onClose={onClose}
      size="lg"
      kind={t("kind")}
      title={t("newTitle")}
      actions={
        <Button icon={canApprove ? Check : Send} loading={create.isPending} onClick={submit}>
          {canApprove ? t("accept") : t("send")}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {error ? (
          <Alert tone="danger" title={t("errorTitle")}>
            {error}
          </Alert>
        ) : null}
        {tried && errors.length > 0 ? (
          <Alert tone="danger" title={t("vsTitle", { n: errors.length })}>
            <ul className="list-disc pl-5">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </Alert>
        ) : null}
        <div className="grid grid-cols-4 gap-4">
          <Select
            label={t("head.customer")}
            value={customer}
            loadOptions={async (q) => {
              const found = await searchCustomers(q);
              found.forEach((o) => seen.current.set(o.value, o.label));
              return found;
            }}
            onChange={(v) => (
              setCustomer(v),
              setCustomerLabel(v ? (seen.current.get(v) ?? "") : ""),
              setSaleId(null),
              setQty({}),
              setReasons({})
            )}
            placeholder={customerLabel || t("choose")}
            options={customer && customerLabel ? [{ value: customer, label: customerLabel }] : []}
            required
          />
          <div className="col-span-2">
            <Select
              label={t("head.sale")}
              value={saleId}
              onChange={(v) => (setSaleId(v), setQty({}), setReasons({}))}
              options={(sales.data ?? []).map((s) => ({
                value: String(s.id),
                label: `${s.number} · ${day(s.saleDate)} · ${formatMoney(s.total)}`,
                sub: t("canReturn", { n: s.returnableLines }),
              }))}
              placeholder={customer ? t("choose") : t("pickCustomer")}
              disabled={!customer}
              hint={
                customer && sales.data && sales.data.length === 0
                  ? t("noSales")
                  : sale
                    ? t("saleHint", { n: sale.returnableLines })
                    : undefined
              }
              required
            />
          </div>
          <Select
            label={t("head.warehouse")}
            value={sale ? String(sale.warehouseId) : null}
            onChange={() => undefined}
            options={sale ? [{ value: String(sale.warehouseId), label: sale.warehouse }] : []}
            placeholder="—"
            hint={t("whLocked")}
            disabled
          />
        </div>
        {!canApprove ? (
          <Alert tone="info" title={t("keeperAccepts")}>
            {t("keeperAcceptsBody")}
          </Alert>
        ) : null}
        {saleId ? (
          lines.error ? (
            <ErrorState onRetry={() => lines.refetch()} />
          ) : (
            <Table
              caption={t("linesCaption")}
              density="compact"
              columns={columns}
              rows={rows}
              rowKey={(r) => String(r.saleLineId)}
              loading={lines.isPending}
              emptyState={<EmptyState icon={X} title={t("emptyLines")} description={t("fromSale")} />}
            />
          )
        ) : (
          <EmptyState icon={X} title={t("emptyQm")} description={t("fromSale")} />
        )}
        {saleId ? (
          <p className="text-right text-body">
            {t("totals", { lines: formatQuantity(picked.lines.length), qty: formatQuantity(pickedQty) })}{" "}
            <span className="font-semibold">{t("totalSum", { sum: formatMoney(total) })}</span>
          </p>
        ) : null}
        <TextField
          label={t("head.note")}
          value={note}
          onChange={setNote}
          placeholder={t("notePlaceholder")}
          required={picked.lines.some((l) => l.reason === "OTHER")}
        />
      </div>
    </Drawer>
  );
}
