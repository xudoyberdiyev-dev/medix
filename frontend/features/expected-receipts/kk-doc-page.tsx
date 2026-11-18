"use client";

import { Check, CheckCheck, Download, FilePenLine, FileText, PackageCheck, Paperclip, Truck, X } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DocumentHeader } from "@/components/ui/document-header";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { ErrorState, ForbiddenState, Skeleton } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { can, canAny } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { parseUzDate } from "@/features/counterparties/api";
import { useWarehouses, zoneLabel } from "@/features/organization/api";
import { Steps } from "@/features/payments/payment-doc-page";
import { describeError } from "@/features/setup/form-error";
import { InfoRow, SideCard } from "@/features/warehouse-transfers/transfer-doc-page";
import { formatDateTime, formatMoney, formatQuantity } from "@/lib/format";
import {
  KK_APPROVE,
  KK_CREATE,
  KK_VIEW_KEYS,
  checkKkFile,
  kkFileUrl,
  receivableLines,
  useApproveExpectedReceipt,
  useCancelExpectedReceipt,
  useCloseExpectedReceipt,
  useExpectedReceipt,
  useReceiveExpectedReceipt,
  useUploadKkFile,
  type KkDetail,
  type KkLine,
} from "./api";
import { KkLateBadge, KkStatusBadge, kkDay } from "./kk-list-page";

/** KK — kutilayotgan kirim hujjati (O15). */
export function KkDocPage({ id }: { id: number }) {
  const t = useTranslations("expectedReceipts");
  const me = useMe();
  const doc = useExpectedReceipt(id);
  if (me.data && !canAny(me.data, KK_VIEW_KEYS)) return <ForbiddenState description={t("forbidden")} />;
  if (doc.error) return <ErrorState error={doc.error} onRetry={() => doc.refetch()} />;
  if (!doc.data)
    return (
      <div className="flex flex-col gap-4" aria-label={t("doc.loading")}>
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  return <View doc={doc.data} />;
}

interface RecvRow {
  qty: string;
  batch: string;
  expiry: string;
}

function View({ doc }: { doc: KkDetail }) {
  const t = useTranslations("expectedReceipts");
  const td = useTranslations("expectedReceipts.doc");
  const me = useMe();
  const approve = useApproveExpectedReceipt();
  const cancel = useCancelExpectedReceipt();
  const close = useCloseExpectedReceipt();
  const receive = useReceiveExpectedReceipt();
  const upload = useUploadKkFile();
  const warehouses = useWarehouses();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dlg, setDlg] = useState<"approve" | "cancel" | "close" | "receive" | null>(null);
  const [reason, setReason] = useState("");
  const [zone, setZone] = useState("");
  const [recv, setRecv] = useState<Record<number, RecvRow>>({});
  const [recvError, setRecvError] = useState<string | null>(null);
  const st = doc.status;
  const open = st === "IN_TRANSIT" || st === "PARTIAL";
  const canEdit = st === "DRAFT" && can(me.data, KK_CREATE);
  const canApprove = st === "DRAFT" && can(me.data, KK_APPROVE);
  const canCancel = (st === "DRAFT" && canAny(me.data, [KK_CREATE, KK_APPROVE])) || (st === "IN_TRANSIT" && can(me.data, KK_APPROVE));
  const canReceive = open && canAny(me.data, [KK_CREATE, KK_APPROVE]);
  const canClose = st === "PARTIAL" && can(me.data, KK_APPROVE);
  const withCost = doc.totalAmount != null;
  const credit = doc.paymentKind === "CREDIT";
  const at = (iso?: string | null) => (iso ? formatDateTime(new Date(iso)) : "");
  const fail = (e: unknown) => toast({ tone: "danger", title: t("failed"), description: describeError(e).message ?? t("retryHint") });
  const zones =
    (warehouses.data ?? []).find((w) => w.id === doc.warehouseId)?.zones.filter((z) => z.active && z.type !== "RECEIVING") ?? [];
  const remaining = receivableLines(doc.lines);
  const steps = [
    { label: td("stepDraft"), state: st === "DRAFT" ? ("cur" as const) : ("done" as const) },
    {
      label: td("stepTransit"),
      state: st === "CANCELLED" ? ("fail" as const) : open ? ("cur" as const) : st === "DRAFT" ? ("next" as const) : ("done" as const),
    },
    { label: td("stepReceived"), state: st === "RECEIVED" ? ("done" as const) : ("next" as const) },
  ];

  const startReceive = () => {
    const init: Record<number, RecvRow> = {};
    for (const l of remaining)
      init[l.id] = { qty: String(l.remainingQty), batch: l.batchNumber ?? "", expiry: kkDay(l.expiryDate).replace("—", "") };
    setRecv(init);
    setZone(zones.find((z) => z.type === "MAIN")?.id.toString() ?? "");
    setRecvError(null);
    setDlg("receive");
  };

  const submitReceive = () => {
    const lines = [];
    for (const l of remaining) {
      const r = recv[l.id];
      if (!r || r.qty.trim() === "" || r.qty.trim() === "0") continue;
      const qty = Number(r.qty);
      const expiry = parseUzDate(r.expiry);
      if (!Number.isInteger(qty) || qty <= 0 || qty > l.remainingQty)
        return setRecvError(td("errQty", { n: l.lineNo, max: l.remainingQty }));
      if (!r.batch.trim() || !expiry) return setRecvError(td("errBatch", { n: l.lineNo }));
      lines.push({ expectedLineId: l.id, qty, batchNumber: r.batch.trim(), expiryDate: expiry, zoneId: Number(zone) });
    }
    if (!zone) return setRecvError(td("errZone"));
    if (lines.length === 0) return setRecvError(td("errNothing"));
    receive.mutate(
      { id: doc.id, body: { lines } },
      {
        onSuccess: (r) => {
          setDlg(null);
          toast({ tone: "success", title: td("received"), description: r.receiptNumber });
        },
        onError: (e) => setRecvError(describeError(e).message ?? t("failed")),
      },
    );
  };

  const onFile = (file: File | undefined) => {
    if (!file) return;
    const err = checkKkFile(file);
    if (err) return toast({ tone: "danger", title: td(err === "type" ? "fileType" : "fileSize") });
    upload.mutate({ id: doc.id, file }, { onSuccess: () => toast({ tone: "success", title: td("fileUploaded") }), onError: fail });
  };

  const columns: TableColumn<KkLine>[] = [
    {
      key: "productName",
      title: t("col.product"),
      wrap: true,
      render: (l) => (
        <span className="flex min-w-0 flex-col">
          <span className="font-medium">{l.productName}</span>
          <span className="font-mono text-caption text-text-secondary">{l.productCode}</span>
        </span>
      ),
    },
    { key: "batchNumber", title: t("col.batch"), mono: true, render: (l) => l.batchNumber ?? "—" },
    { key: "expiryDate", title: t("col.expiry"), render: (l) => kkDay(l.expiryDate) },
    { key: "qty", title: td("cExpected"), align: "right", render: (l) => <span className="tabular-nums">{formatQuantity(l.qty)}</span> },
    {
      key: "receivedQty",
      title: td("cReceived"),
      align: "right",
      render: (l) => <span className="tabular-nums">{formatQuantity(l.receivedQty)}</span>,
    },
    {
      key: "writtenOffQty",
      title: td("cWrittenOff"),
      align: "right",
      render: (l) => <span className="tabular-nums">{l.writtenOffQty > 0 ? formatQuantity(l.writtenOffQty) : "—"}</span>,
    },
    {
      key: "remainingQty",
      title: td("cRemaining"),
      align: "right",
      render: (l) => <span className="font-semibold tabular-nums">{formatQuantity(l.remainingQty)}</span>,
    },
    ...(withCost
      ? [
          {
            key: "price",
            title: t("col.price"),
            align: "right" as const,
            render: (l: KkLine) => <span className="tabular-nums">{l.price != null ? formatMoney(l.price) : "—"}</span>,
          },
          {
            key: "amount",
            title: t("col.amount"),
            align: "right" as const,
            render: (l: KkLine) => <span className="tabular-nums">{l.amount != null ? formatMoney(l.amount) : "—"}</span>,
          },
        ]
      : []),
  ];

  return (
    <div className="flex min-w-0 flex-col gap-4 pb-12">
      <DocumentHeader
        parent={{ label: t("listTitle"), href: "/expected-receipts" }}
        crumb={doc.number}
        crumbMono
        title={t("kind")}
        number={doc.number}
        status={
          <span className="flex items-center gap-2">
            <KkStatusBadge status={st} />
            {doc.late ? <KkLateBadge /> : null}
          </span>
        }
        sub={
          <span className="inline-flex items-center gap-1">
            <Truck size={14} strokeWidth={1.5} aria-hidden />
            {doc.supplier} · {doc.warehouse}
          </span>
        }
        meta={<Steps steps={steps} />}
        actions={
          <>
            {doc.receipts.some((r) => r.status === "POSTED") || st === "RECEIVED" ? (
              <Button
                variant="secondary"
                icon={FileText}
                onClick={() => window.open(`/api/expected-receipts/${doc.id}/act/pdf`, "_blank", "noopener")}
              >
                {td("act")}
              </Button>
            ) : null}
            {canCancel ? (
              <Button variant="secondary" icon={X} onClick={() => (setReason(""), setDlg("cancel"))}>
                {td("cancel")}
              </Button>
            ) : null}
            {canEdit ? (
              <Link href={`/expected-receipts/${doc.id}/edit`}>
                <Button variant="secondary" icon={FilePenLine}>
                  {td("edit")}
                </Button>
              </Link>
            ) : null}
            {canClose ? (
              <Button variant="secondary" icon={CheckCheck} onClick={() => (setReason(""), setDlg("close"))}>
                {td("close")}
              </Button>
            ) : null}
            {canApprove ? (
              <Button icon={Check} onClick={() => setDlg("approve")}>
                {td("approve")}
              </Button>
            ) : null}
            {canReceive ? (
              <Button icon={PackageCheck} onClick={startReceive}>
                {td("receive")}
              </Button>
            ) : null}
          </>
        }
      />
      {st === "DRAFT" ? <Alert tone="info" title={td(credit ? "bDraftCredit" : "bDraftOther")} /> : null}
      {open ? (
        <Alert tone="warning" title={td("bTransit", { date: kkDay(doc.expectedDate) })}>
          {credit && doc.debtAmount ? td("bTransitDebt", { amount: formatMoney(doc.debtAmount) }) : td("bTransitBody")}
        </Alert>
      ) : null}
      {st === "CANCELLED" ? (
        <Alert tone="info" title={td("bCancelled", { reason: doc.cancelReason ?? "" })}>
          {td("bCancelledBy", { who: doc.cancelledBy ?? "", at: at(doc.cancelledAt) })}
        </Alert>
      ) : null}
      <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="flex min-w-0 flex-col gap-4">
          <section className="rounded-card border border-border bg-surface">
            <h2 className="border-b border-border px-5 py-4 text-subtitle">{td("info")}</h2>
            <dl className="flex flex-col px-5 py-2">
              <InfoRow k={td("waybill")} v={`${doc.waybillNumber} · ${kkDay(doc.waybillDate)}`} />
              {doc.invoiceNumber || doc.invoiceDate ? (
                <InfoRow k={td("invoice")} v={`${doc.invoiceNumber ?? "—"} · ${kkDay(doc.invoiceDate)}`} />
              ) : null}
              {doc.contract ? <InfoRow k={td("contract")} v={doc.contract} /> : null}
              <InfoRow k={td("supplier")} v={doc.supplier} />
              <InfoRow k={td("warehouse")} v={doc.warehouse} />
              <InfoRow k={td("payment")} v={t(`payment.${doc.paymentKind}`)} />
              <InfoRow k={td("expected")} v={kkDay(doc.expectedDate)} />
              {credit ? <InfoRow k={td("due")} v={kkDay(doc.dueDate)} /> : null}
              <InfoRow k={td("by")} v={`${doc.createdBy} · ${at(doc.createdAt)}`} />
              {doc.approvedBy ? <InfoRow k={td("approvedBy")} v={`${doc.approvedBy} · ${at(doc.approvedAt)}`} /> : null}
              {doc.note ? <InfoRow k={td("note")} v={doc.note} /> : null}
            </dl>
          </section>
          <section className="rounded-card border border-border bg-surface">
            <h2 className="flex items-center gap-2 px-5 py-4 text-subtitle">
              {td("lines")}
              <span className="font-normal text-text-secondary">{doc.lines.length}</span>
            </h2>
            <Table caption={td("linesCaption")} density="compact" columns={columns} rows={doc.lines} rowKey={(l) => String(l.id)} />
          </section>
          {doc.receipts.length > 0 ? (
            <section className="rounded-card border border-border bg-surface">
              <h2 className="px-5 py-4 text-subtitle">{td("receipts")}</h2>
              <ul className="flex flex-col px-5 pb-4">
                {doc.receipts.map((r) => (
                  <li key={r.id} className="flex items-center justify-between border-t border-border py-2 text-body">
                    <Link href={`/receipts/${r.id}`} className="font-mono text-primary hover:underline">
                      {r.number}
                    </Link>
                    <span className="text-text-secondary">
                      {kkDay(r.receiptDate)} · {td(`receiptStatus.${r.status as "DRAFT" | "ACCEPTED" | "POSTED" | "CANCELLED"}`)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
        <aside className="flex min-w-0 flex-col gap-3">
          <SideCard label={td("sProgress")} value={`${formatQuantity(doc.receivedQty)} / ${formatQuantity(doc.qty)}`} />
          {withCost && doc.totalAmount ? <SideCard label={td("sAmount")} value={formatMoney(doc.totalAmount)} /> : null}
          {credit && doc.debtOpen != null ? (
            <SideCard label={td("sDebtOpen")} value={formatMoney(doc.debtOpen)} note={td("sDebtNote", { date: kkDay(doc.dueDate) })} />
          ) : null}
          <section className="flex flex-col gap-2 rounded-card border border-border bg-surface p-4">
            <span className="text-caption text-text-secondary">{td("files")}</span>
            {doc.files.length === 0 ? <span className="text-body text-text-secondary">{td("noFiles")}</span> : null}
            {doc.files.map((f) => (
              <a key={f.id} href={kkFileUrl(f.id)} className="flex items-center gap-2 text-body text-primary hover:underline">
                <Download size={14} strokeWidth={1.5} aria-hidden />
                <span className="truncate">{f.fileName}</span>
              </a>
            ))}
            {st !== "CANCELLED" && canAny(me.data, [KK_CREATE, KK_APPROVE]) ? (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                  className="sr-only"
                  aria-label={td("upload")}
                  onChange={(e) => (onFile(e.target.files?.[0]), (e.target.value = ""))}
                />
                <Button variant="secondary" size="sm" icon={Paperclip} loading={upload.isPending} onClick={() => fileRef.current?.click()}>
                  {td("upload")}
                </Button>
              </>
            ) : null}
          </section>
        </aside>
      </div>
      <Modal
        open={dlg === "approve"}
        onClose={() => setDlg(null)}
        title={td("dApproveT", { n: doc.number })}
        primaryAction={{
          label: td("approve"),
          loading: approve.isPending,
          onClick: () =>
            approve.mutate(doc.id, {
              onSuccess: (d) => (setDlg(null), toast({ tone: "success", title: td("approved"), description: d.number })),
              onError: fail,
            }),
        }}
      >
        <p className="text-body">
          {credit
            ? td("dApproveCredit", {
                amount: doc.totalAmount ? formatMoney(doc.totalAmount) : "—",
                s: doc.supplier,
                date: kkDay(doc.dueDate),
              })
            : td("dApproveOther")}
        </p>
      </Modal>
      <Modal
        open={dlg === "cancel"}
        onClose={() => setDlg(null)}
        title={td("dCancelT")}
        tone="danger"
        primaryAction={{
          label: td("cancel"),
          loading: cancel.isPending,
          disabled: reason.trim() === "",
          onClick: () =>
            cancel.mutate(
              { id: doc.id, reason: reason.trim() },
              { onSuccess: () => (setDlg(null), toast({ tone: "success", title: td("cancelled") })), onError: fail },
            ),
        }}
      >
        {st === "IN_TRANSIT" && credit ? <p className="mb-3 text-body">{td("dCancelDebt")}</p> : null}
        <TextField label={td("reason")} value={reason} onChange={setReason} required />
      </Modal>
      <Modal
        open={dlg === "close"}
        onClose={() => setDlg(null)}
        title={td("dCloseT")}
        tone="danger"
        primaryAction={{
          label: td("close"),
          loading: close.isPending,
          disabled: reason.trim() === "",
          onClick: () =>
            close.mutate(
              { id: doc.id, reason: reason.trim() },
              { onSuccess: () => (setDlg(null), toast({ tone: "success", title: td("closed") })), onError: fail },
            ),
        }}
      >
        <p className="mb-3 text-body">{td(credit ? "dCloseCredit" : "dCloseOther")}</p>
        <TextField label={td("reason")} value={reason} onChange={setReason} required />
      </Modal>
      <Modal
        open={dlg === "receive"}
        onClose={() => setDlg(null)}
        size="lg"
        title={td("dReceiveT", { n: doc.number })}
        primaryAction={{ label: td("dReceiveGo"), loading: receive.isPending, onClick: submitReceive }}
      >
        <div className="flex flex-col gap-3">
          <p className="text-body text-text-secondary">{td("dReceive")}</p>
          {recvError ? <Alert tone="danger" title={recvError} /> : null}
          <Select
            label={td("zone")}
            value={zone}
            onChange={(v) => setZone(v ?? "")}
            options={zones.map((z) => ({ value: String(z.id), label: z.name, sub: zoneLabel(z.type) }))}
            required
          />
          {remaining.map((l) => (
            <div key={l.id} className="grid grid-cols-1 items-end gap-2 border-t border-border pt-3 md:grid-cols-4">
              <span className="flex flex-col text-body md:col-span-4">
                <span className="font-medium">
                  {l.lineNo}. {l.productName}
                </span>
                <span className="text-caption text-text-secondary">{td("left", { n: formatQuantity(l.remainingQty) })}</span>
              </span>
              <TextField
                label={td("rQty")}
                size="sm"
                value={recv[l.id]?.qty ?? ""}
                onChange={(v) => setRecv((r) => ({ ...r, [l.id]: { ...r[l.id], qty: v } }))}
              />
              <TextField
                label={td("rBatch")}
                size="sm"
                value={recv[l.id]?.batch ?? ""}
                onChange={(v) => setRecv((r) => ({ ...r, [l.id]: { ...r[l.id], batch: v } }))}
              />
              <TextField
                label={td("rExpiry")}
                size="sm"
                variant="date"
                value={recv[l.id]?.expiry ?? ""}
                placeholder={td("datePlaceholder")}
                onChange={(v) => setRecv((r) => ({ ...r, [l.id]: { ...r[l.id], expiry: v } }))}
              />
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
