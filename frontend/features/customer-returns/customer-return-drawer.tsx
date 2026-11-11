"use client";

import { Ban, Check, HandCoins, Link2, Lock, Printer, Send, ShieldAlert, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DocumentHeader } from "@/components/ui/document-header";
import { DocTabs, docEvents } from "@/components/ui/doc-tabs";
import { HubTabs } from "@/components/shell/hub-tabs";
import { Drawer } from "@/components/ui/drawer";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { EmptyState, ErrorState, ForbiddenState, Skeleton } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { can, canAny } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { searchCustomers } from "@/features/orders/api";
import { Steps } from "@/features/payments/payment-doc-page";
import { describeError } from "@/features/setup/form-error";
import { ApiError } from "@/lib/api/errors";
import { formatDate, formatDateTime, formatMoney, formatQuantity } from "@/lib/format";
import { useBranchStore } from "@/lib/stores/branch";
import {
  QM_APPROVE,
  QM_CANCEL_POSTED,
  QM_VIEW_KEYS,
  useApproveCustomerReturn,
  useCancelCustomerReturn,
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

/** QM — mijozdan qaytarish hujjati toʻliq sahifa (prototip `StockDocs`, kind = qm). */
export function CustomerReturnDocPage({ id }: { id: number }) {
  const t = useTranslations("customerReturns");
  const me = useMe();
  const router = useRouter();
  const doc = useCustomerReturn(id);
  if (me.data && !canAny(me.data, QM_VIEW_KEYS)) return <ForbiddenState description={t("forbidden")} />;
  if (doc.error) return <ErrorState onRetry={() => doc.refetch()} />;
  if (!doc.data)
    return (
      <div className="flex flex-col gap-4" aria-label={t("doc.loading")}>
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  return <View doc={doc.data} page onClose={() => router.push("/customer-returns")} />;
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

function View({ doc, onClose, page = false }: { doc: CustomerReturnDetail; onClose: () => void; page?: boolean }) {
  const t = useTranslations("customerReturns");
  const tc = useTranslations("common");
  const me = useMe();
  const approve = useApproveCustomerReturn();
  const reject = useRejectCustomerReturn();
  const [confirming, setConfirming] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const cancel = useCancelCustomerReturn();
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [blocked, setBlocked] = useState<string | null>(null);
  const canDecide = doc.status === "PENDING" && can(me.data, QM_APPROVE);
  const canCancel = doc.status === "POSTED" && can(me.data, QM_CANCEL_POSTED);
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
  const actions = (
    <>
      <Button variant="tertiary" icon={Printer} onClick={() => window.open(`/api/customer-returns/${doc.id}/pdf`, "_blank", "noopener")}>
        {t("view.print")}
      </Button>
      {canCancel ? (
        <Button variant="secondary" icon={Ban} onClick={() => (setCancelReason(""), setCancelling(true))}>
          {t("view.cancel")}
        </Button>
      ) : null}
      {canDecide ? (
        <>
          <Button variant="secondary" icon={X} onClick={() => setRejecting(true)}>
            {t("view.reject")}
          </Button>
          <Button icon={Check} onClick={() => setConfirming(true)}>
            {t("accept")}
          </Button>
        </>
      ) : null}
    </>
  );
  const body = (
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
      {doc.status === "CANCELLED" ? (
        <Alert tone="info" title={t("view.cancelledTitle", { reason: doc.cancelReason ?? "" })}>
          {t("view.cancelledBody", {
            who: doc.cancelledBy ?? "",
            at: doc.cancelledAt ? formatDateTime(new Date(doc.cancelledAt)) : "",
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
  );
  const modals = (
    <>
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
      <Modal
        open={cancelling}
        onClose={() => setCancelling(false)}
        title={t("view.cancelTitle")}
        tone="danger"
        primaryAction={{
          label: t("view.cancel"),
          loading: cancel.isPending,
          disabled: cancelReason.trim() === "",
          onClick: () =>
            cancel.mutate(
              { id: doc.id, reason: cancelReason.trim() },
              {
                onSuccess: () => (setCancelling(false), toast({ tone: "success", title: t("view.cancelled") })),
                onError: (e) =>
                  e instanceof ApiError && e.code === "qm.cancelBlocked" ? (setCancelling(false), setBlocked(e.message)) : fail(e),
              },
            ),
        }}
      >
        <div className="flex flex-col gap-4">
          <p className="text-body text-text-secondary">
            {t("view.cancelBody", { zone: doc.quarantineZone ?? t("quarantine"), sum: formatMoney(doc.total) })}
          </p>
          <TextField
            label={t("view.cancelReason")}
            value={cancelReason}
            onChange={setCancelReason}
            placeholder={t("view.cancelPlaceholder")}
            required
          />
        </div>
      </Modal>
      <Modal
        open={blocked !== null}
        onClose={() => setBlocked(null)}
        title={t("view.blockedTitle")}
        primaryAction={{ label: tc("close"), onClick: () => setBlocked(null) }}
      >
        <Alert tone="danger" title={blocked ?? ""}>
          {t("view.blockedHint")}
        </Alert>
      </Modal>
    </>
  );
  if (page)
    return (
      <div className="flex min-w-0 flex-col gap-4 pb-12">
        <HubTabs hub="returns" className="-mb-1" />
        <DocumentHeader
          parent={{ label: t("listTitle"), href: "/customer-returns" }}
          crumb={doc.number}
          crumbMono
          title={t("kind")}
          number={doc.number}
          status={<CustomerReturnStatusBadge status={doc.status} />}
          sub={`${doc.customer} · ${doc.warehouse} · ${day(doc.returnDate)}`}
          meta={
            <Steps
              steps={[
                { label: t("doc.stepCreated"), state: "done" },
                {
                  label: t("doc.stepApproval"),
                  state: doc.status === "PENDING" ? "cur" : doc.status === "REJECTED" ? "fail" : "done",
                },
                { label: t("doc.stepPosted"), state: doc.status === "POSTED" ? "done" : doc.status === "CANCELLED" ? "fail" : "next" },
              ]}
            />
          }
          actions={actions}
        />
        <DocTabs events={docEvents(doc)}>
          <section className="rounded-card border border-border bg-surface p-5">{body}</section>
        </DocTabs>
        {modals}
      </div>
    );
  return (
    <Drawer
      open
      onClose={onClose}
      size="lg"
      kind={`${t("kind")} · ${doc.createdBy}`}
      title={doc.number}
      subtitle={formatDateTime(new Date(doc.createdAt))}
      status={<CustomerReturnStatusBadge status={doc.status} />}
      actions={actions}
    >
      {body}
      {modals}
    </Drawer>
  );
}

export function CreateForm({
  onClose,
  onCreated,
  page = false,
}: {
  onClose: () => void;
  onCreated: (id: number) => void;
  /** Toʻliq sahifa (prototip `StockDocs`, kind = qm, yangi hujjat). */
  page?: boolean;
}) {
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

  const action = (
    <Button icon={canApprove ? Check : Send} loading={create.isPending} onClick={submit}>
      {canApprove ? t("accept") : t("send")}
    </Button>
  );
  const body = (
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
  );
  if (page)
    return (
      <div className="flex min-w-0 flex-col gap-4 pb-12">
        <HubTabs hub="returns" className="-mb-1" />
        <DocumentHeader
          parent={{ label: t("listTitle"), href: "/customer-returns" }}
          crumb={t("crumbNew")}
          title={t("newTitle")}
          actions={action}
        />
        <section className="rounded-card border border-border bg-surface p-5">{body}</section>
      </div>
    );
  return (
    <Drawer open onClose={onClose} size="lg" kind={t("kind")} title={t("newTitle")} actions={action}>
      {body}
    </Drawer>
  );
}
