"use client";

import { Check, Layers, Printer, X } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DocumentHeader } from "@/components/ui/document-header";
import { DocTabs, docEvents } from "@/components/ui/doc-tabs";
import { HubTabs } from "@/components/shell/hub-tabs";
import { Modal } from "@/components/ui/modal";
import { ErrorState, ForbiddenState, Skeleton } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { can, canAny } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { Steps } from "@/features/payments/payment-doc-page";
import { describeError } from "@/features/setup/form-error";
import { InfoRow, SideCard, ZoneCell } from "@/features/warehouse-transfers/transfer-doc-page";
import { formatDate, formatDateTime, formatMoney, formatQuantity } from "@/lib/format";
import {
  QY_APPROVE,
  QY_VIEW_KEYS,
  useApproveSupplierReturn,
  useRejectSupplierReturn,
  useSupplierReturn,
  type SupplierReturnDetail,
} from "./api";
import { BonusBadge } from "./supplier-return-drawer";
import { SupplierReturnStatusBadge } from "./supplier-returns-page";

type Line = SupplierReturnDetail["lines"][number];
const day = (iso: string) => formatDate(new Date(`${iso}T00:00:00+05:00`));

/** QY — yetkazib beruvchiga qaytarish hujjati toʻliq sahifa (prototip `StockDocs`, kind = qy). */
export function SupplierReturnDocPage({ id }: { id: number }) {
  const t = useTranslations("supplierReturns");
  const me = useMe();
  const doc = useSupplierReturn(id);
  if (me.data && !canAny(me.data, QY_VIEW_KEYS)) return <ForbiddenState description={t("forbidden")} />;
  if (doc.error) return <ErrorState onRetry={() => doc.refetch()} />;
  if (!doc.data)
    return (
      <div className="flex flex-col gap-4" aria-label={t("doc.loading")}>
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  return <View doc={doc.data} />;
}

function View({ doc }: { doc: SupplierReturnDetail }) {
  const t = useTranslations("supplierReturns");
  const td = useTranslations("supplierReturns.doc");
  const tw = useTranslations("warehouseTransfers.doc");
  const me = useMe();
  const approve = useApproveSupplierReturn();
  const reject = useRejectSupplierReturn();
  const [dlg, setDlg] = useState<"approve" | "reject" | null>(null);
  const [reason, setReason] = useState("");
  const canDecide = doc.status === "PENDING" && can(me.data, QY_APPROVE);
  const withCost = doc.totalAmount != null;
  const st = doc.status;
  const at = (iso?: string | null) => (iso ? formatDateTime(new Date(iso)) : "");
  const fail = (e: unknown) => toast({ tone: "danger", title: t("failed"), description: describeError(e).message ?? t("retryHint") });
  const steps = [
    { label: td("stepCreated"), state: "done" as const },
    {
      label: td("stepApproval"),
      state: st === "PENDING" ? ("cur" as const) : st === "REJECTED" ? ("fail" as const) : ("done" as const),
    },
    { label: td("stepPosted"), state: st === "POSTED" ? ("done" as const) : ("next" as const) },
  ];

  const columns: TableColumn<Line>[] = [
    {
      key: "productName",
      title: t("col.product"),
      wrap: true,
      render: (l) => (
        <span className="flex min-w-0 flex-col">
          <span className="flex items-center gap-2 font-medium">
            {l.productName}
            {l.bonus ? <BonusBadge /> : null}
          </span>
          <span className="font-mono text-caption text-text-secondary">{l.productCode}</span>
        </span>
      ),
    },
    { key: "batchNumber", title: t("col.batch"), mono: true },
    { key: "expiryDate", title: t("col.expiry"), render: (l) => day(l.expiryDate) },
    { key: "zone", title: tw("cFromZone"), render: () => <ZoneCell name={doc.zone.name} /> },
    {
      key: "qty",
      title: t("col.count"),
      align: "right",
      render: (l) => <span className="font-semibold tabular-nums">{formatQuantity(l.qty)}</span>,
    },
    ...(withCost
      ? [
          {
            key: "price",
            title: t("col.price"),
            align: "right" as const,
            render: (l: Line) => <span className="tabular-nums">{l.price != null ? formatMoney(l.price) : "—"}</span>,
          },
          {
            key: "amount",
            title: t("col.amount"),
            align: "right" as const,
            render: (l: Line) => <span className="tabular-nums">{l.amount != null ? formatMoney(l.amount) : "—"}</span>,
          },
        ]
      : []),
  ];

  return (
    <div className="flex min-w-0 flex-col gap-4 pb-12">
      <HubTabs hub="returns" className="-mb-1" />
      <DocumentHeader
        parent={{ label: td("parent"), href: "/supplier-returns" }}
        crumb={doc.number}
        crumbMono
        title={t("kind")}
        number={doc.number}
        status={<SupplierReturnStatusBadge status={st} />}
        sub={
          <span className="inline-flex items-center gap-1">
            <Layers size={14} strokeWidth={1.5} aria-hidden />
            {doc.supplier} · {doc.warehouse} · {doc.zone.name}
          </span>
        }
        meta={<Steps steps={steps} />}
        actions={
          <>
            <Button
              variant="secondary"
              icon={Printer}
              onClick={() => window.open(`/api/supplier-returns/${doc.id}/pdf`, "_blank", "noopener")}
            >
              {t("view.print")}
            </Button>
            {canDecide ? (
              <>
                <Button variant="secondary" icon={X} onClick={() => (setReason(""), setDlg("reject"))}>
                  {t("view.reject")}
                </Button>
                <Button icon={Check} loading={approve.isPending} onClick={() => setDlg("approve")}>
                  {t("view.approve")}
                </Button>
              </>
            ) : null}
          </>
        }
      />
      <DocTabs events={docEvents(doc)}>
        {st === "PENDING" ? (
          <Alert tone="warning" title={t("view.pendingTitle")}>
            {t("view.pendingBody", { zone: doc.zone.name })}
          </Alert>
        ) : null}
        {st === "POSTED" ? <Alert tone="success" title={td("bPosted", { at: at(doc.postedAt), who: doc.postedBy ?? "" })} /> : null}
        {st === "REJECTED" ? (
          <Alert tone="info" title={t("view.rejectedTitle", { reason: doc.rejectReason ?? "" })}>
            {t("view.rejectedBody", { who: doc.rejectedBy ?? "" })}
          </Alert>
        ) : null}
        <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="flex min-w-0 flex-col gap-4">
            <section className="rounded-card border border-border bg-surface">
              <h2 className="border-b border-border px-5 py-4 text-subtitle">{tw("info")}</h2>
              <dl className="flex flex-col px-5 py-2">
                <InfoRow k={tw("hDate")} v={formatDate(new Date(doc.createdAt))} />
                <InfoRow k={t("view.supplier")} v={doc.supplier} />
                <InfoRow
                  k={t("view.receipt")}
                  v={
                    <Link href={`/receipts/${doc.receiptId}`} className="text-primary hover:underline">
                      <span className="font-mono">{doc.receiptNumber}</span> · {day(doc.receiptDate)}
                    </Link>
                  }
                />
                <InfoRow k={t("view.warehouseZone")} v={`${doc.warehouse} · ${doc.zone.name}`} />
                <InfoRow k={t("view.reason")} v={t(`reason.${doc.reason}`)} />
                <InfoRow k={t("view.settlement")} v={doc.fromBonus ? t("view.fromBonus") : t("view.debt")} />
                <InfoRow k={tw("hBy")} v={doc.createdBy} />
                {doc.note ? <InfoRow k={t("view.note")} v={doc.note} /> : null}
              </dl>
            </section>
            <section className="rounded-card border border-border bg-surface">
              <h2 className="flex items-center gap-2 px-5 py-4 text-subtitle">
                {tw("lines")}
                <span className="font-normal text-text-secondary">{doc.lines.length}</span>
              </h2>
              <Table caption={t("view.linesCaption")} density="compact" columns={columns} rows={doc.lines} rowKey={(l) => String(l.id)} />
            </section>
          </div>
          <aside className="flex min-w-0 flex-col gap-3">
            <SideCard label={tw("sLines")} value={formatQuantity(doc.lines.length)} />
            <SideCard label={tw("sQty")} value={formatQuantity(doc.totalQty)} />
            {withCost && doc.totalAmount ? <SideCard label={td("sAmount")} value={formatMoney(doc.totalAmount)} /> : null}
            <SideCard label={td("sBy")} value={doc.createdBy} note={at(doc.createdAt)} />
            <SideCard
              label={st === "REJECTED" ? td("sRejected") : td("sPosted")}
              value={(st === "REJECTED" ? doc.rejectedBy : doc.postedBy) ?? "—"}
              note={st === "REJECTED" ? at(doc.rejectedAt) : at(doc.postedAt) || undefined}
              muted={st === "PENDING"}
            />
          </aside>
        </div>
      </DocTabs>
      <Modal
        open={dlg === "approve"}
        onClose={() => setDlg(null)}
        title={td("dApproveT", { n: doc.number })}
        primaryAction={{
          label: t("view.approve"),
          loading: approve.isPending,
          onClick: () =>
            approve.mutate(doc.id, {
              onSuccess: (d) => (setDlg(null), toast({ tone: "success", title: t("view.approved"), description: d.number })),
              onError: fail,
            }),
        }}
      >
        <p className="text-body">
          {td("dApprove", { zone: doc.zone.name, q: formatQuantity(doc.totalQty), n: doc.lines.length })}
          {withCost && doc.totalAmount
            ? ` ${td(doc.fromBonus ? "dApproveBonus" : "dApproveDebt", { amount: formatMoney(doc.totalAmount), s: doc.supplier })}`
            : ""}
        </p>
      </Modal>
      <Modal
        open={dlg === "reject"}
        onClose={() => setDlg(null)}
        title={t("view.rejectTitle")}
        tone="danger"
        primaryAction={{
          label: t("view.reject"),
          loading: reject.isPending,
          disabled: reason.trim() === "",
          onClick: () =>
            reject.mutate(
              { id: doc.id, reason: reason.trim() },
              { onSuccess: () => (setDlg(null), toast({ tone: "success", title: t("view.rejected") })), onError: fail },
            ),
        }}
      >
        <TextField label={t("view.rejectReason")} value={reason} onChange={setReason} placeholder={t("view.rejectPlaceholder")} required />
      </Modal>
    </div>
  );
}
