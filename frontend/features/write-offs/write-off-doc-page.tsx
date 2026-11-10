"use client";

import { Check, Layers, Printer, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DocumentHeader } from "@/components/ui/document-header";
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
  HC_APPROVE,
  HC_DIRECTOR,
  HC_DIRECTOR_LIMIT,
  HC_VIEW_KEYS,
  useApproveWriteOff,
  useRejectWriteOff,
  useWriteOff,
  type WriteOffDetail,
} from "./api";
import { WriteOffStatusBadge } from "./write-offs-page";

type Line = WriteOffDetail["lines"][number];
const day = (iso: string) => formatDate(new Date(`${iso}T00:00:00+05:00`));

/** HC — hisobdan chiqarish hujjati toʻliq sahifa (prototip `StockDocs`, kind = hc). */
export function WriteOffDocPage({ id }: { id: number }) {
  const t = useTranslations("writeOffs");
  const me = useMe();
  const doc = useWriteOff(id);
  if (me.data && !canAny(me.data, HC_VIEW_KEYS)) return <ForbiddenState description={t("forbidden")} />;
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

function View({ doc }: { doc: WriteOffDetail }) {
  const t = useTranslations("writeOffs");
  const td = useTranslations("writeOffs.doc");
  const tw = useTranslations("warehouseTransfers.doc");
  const me = useMe();
  const approve = useApproveWriteOff();
  const reject = useRejectWriteOff();
  const [dlg, setDlg] = useState<"approve" | "reject" | null>(null);
  const [reason, setReason] = useState("");
  const level = can(me.data, HC_APPROVE) && (!doc.needsDirector || can(me.data, HC_DIRECTOR));
  const canDecide = doc.status === "PENDING" && level;
  const withCost = doc.totalCost != null;
  const st = doc.status;
  const at = (iso?: string | null) => (iso ? formatDateTime(new Date(iso)) : "");
  const fail = (e: unknown) => toast({ tone: "danger", title: t("failed"), description: describeError(e).message ?? t("retryHint") });
  const steps = [
    { label: td("stepCreated"), state: "done" as const },
    {
      label: doc.needsDirector ? td("stepDirector") : td("stepApproval"),
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
          <span className="font-medium">{l.productName}</span>
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
            key: "cost",
            title: t("col.cost"),
            align: "right" as const,
            render: (l: Line) => <span className="tabular-nums">{l.cost != null ? formatMoney(l.cost) : "—"}</span>,
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
      <DocumentHeader
        parent={{ label: td("parent"), href: "/write-offs" }}
        crumb={doc.number}
        crumbMono
        title={t("kind")}
        number={doc.number}
        status={<WriteOffStatusBadge status={st} />}
        sub={
          <span className="inline-flex items-center gap-1">
            <Layers size={14} strokeWidth={1.5} aria-hidden />
            {doc.warehouse} · {doc.zone.name} · {t(`reason.${doc.reason}`)}
          </span>
        }
        meta={<Steps steps={steps} />}
        actions={
          <>
            <Button variant="secondary" icon={Printer} onClick={() => window.open(`/api/write-offs/${doc.id}/pdf`, "_blank", "noopener")}>
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
      {st === "PENDING" ? (
        <Alert tone="warning" title={doc.needsDirector ? t("view.pendingDirectorTitle") : t("view.pendingTitle")}>
          {doc.needsDirector
            ? t("view.pendingDirectorBody", { limit: formatMoney(HC_DIRECTOR_LIMIT), zone: doc.zone.name })
            : t("view.pendingBody", { zone: doc.zone.name })}
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
              <InfoRow k={t("view.warehouseZone")} v={`${doc.warehouse} · ${doc.zone.name}`} />
              <InfoRow k={t("view.reason")} v={t(`reason.${doc.reason}`)} />
              <InfoRow k={t("view.act")} v={doc.actNo ?? "—"} />
              {doc.commission ? <InfoRow k={t("view.commission")} v={doc.commission} /> : null}
              {doc.sourceTransfer ? <InfoRow k={t("view.source")} v={t("view.sourceBody", { number: doc.sourceTransfer })} /> : null}
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
          {withCost && doc.totalCost ? <SideCard label={td("sCost")} value={formatMoney(doc.totalCost)} /> : null}
          <SideCard label={td("sBy")} value={doc.createdBy} note={at(doc.createdAt)} />
          <SideCard
            label={st === "REJECTED" ? td("sRejected") : td("sPosted")}
            value={(st === "REJECTED" ? doc.rejectedBy : doc.postedBy) ?? "—"}
            note={st === "REJECTED" ? at(doc.rejectedAt) : at(doc.postedAt) || undefined}
            muted={st === "PENDING"}
          />
        </aside>
      </div>
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
          {withCost && doc.totalCost ? ` ${td("dApproveCost", { amount: formatMoney(doc.totalCost) })}` : ""}
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
