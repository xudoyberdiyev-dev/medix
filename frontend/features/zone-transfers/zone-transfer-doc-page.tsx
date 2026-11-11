"use client";

import { ArrowLeftRight, Check, Layers, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DocumentHeader } from "@/components/ui/document-header";
import { HistoryTimeline } from "@/components/ui/history-timeline";
import { Modal } from "@/components/ui/modal";
import { RowMenu } from "@/components/ui/row-menu";
import { ErrorState, ForbiddenState, Skeleton } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { can, canAny } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { useBranchList } from "@/features/organization/api";
import { Steps } from "@/features/payments/payment-doc-page";
import { describeError } from "@/features/setup/form-error";
import { InfoRow, SideCard, ZoneCell } from "@/features/warehouse-transfers/transfer-doc-page";
import { formatDate, formatDateTime, formatQuantity } from "@/lib/format";
import {
  TRANSFER_QUAR,
  TRANSFER_VIEW_KEYS,
  useApproveZoneTransfer,
  useRejectZoneTransfer,
  useZoneTransfer,
  type ZoneTransferDetail,
} from "./api";
import { zkHistory, zkSteps } from "./doc-model";
import { NewZoneTransferPage } from "./zk-new-page";
import { ZoneTransferStatusBadge } from "./zone-transfers-page";

type Line = ZoneTransferDetail["lines"][number];
const day = (iso: string) => formatDate(new Date(`${iso}T00:00:00+05:00`));

/** ZK — zona koʻchirish hujjati toʻliq sahifa (prototip `TransferDoc`, kind = zk). */
export function ZoneTransferDocPage({ id }: { id: number }) {
  const t = useTranslations("warehouseTransfers.doc");
  const me = useMe();
  const doc = useZoneTransfer(id);
  if (me.data && !canAny(me.data, TRANSFER_VIEW_KEYS)) return <ForbiddenState />;
  if (doc.error) return <ErrorState onRetry={() => doc.refetch()} />;
  if (!doc.data)
    return (
      <div className="flex flex-col gap-4" aria-label={t("loading")}>
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  if (doc.data.status === "DRAFT") return <NewZoneTransferPage key={doc.data.id} doc={doc.data} />;
  return <View doc={doc.data} />;
}

function View({ doc }: { doc: ZoneTransferDetail }) {
  const t = useTranslations("zoneTransfers.doc");
  const td = useTranslations("warehouseTransfers.doc");
  const tz = useTranslations("zoneTransfers");
  const me = useMe();
  const branches = useBranchList();
  const approve = useApproveZoneTransfer();
  const reject = useRejectZoneTransfer();
  const [tab, setTab] = useState("doc");
  const [dlg, setDlg] = useState<"approve" | "reject" | null>(null);
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  const fail = (e: unknown) => toast({ tone: "danger", title: tz("failed"), description: describeError(e).message ?? tz("retryHint") });

  const st = doc.status;
  const branch = branches.data?.find((b) => b.id === doc.branchId)?.name ?? "";
  const place = branch ? `${branch} · ${doc.warehouse}` : doc.warehouse;
  const canDecide = st === "PENDING" && can(me.data, TRANSFER_QUAR);
  const steps = zkSteps(st, doc.needsApproval).map((s) => ({ label: td(`step.${s.key}` as "step.draft"), state: s.state }));
  const events = zkHistory(doc);
  const at = (iso?: string | null) => (iso ? formatDateTime(new Date(iso)) : "");

  const columns: TableColumn<Line>[] = [
    { key: "lineNo", title: "№", render: (l) => <span className="text-text-secondary">{l.lineNo}</span> },
    {
      key: "productName",
      title: td("cProduct"),
      wrap: true,
      render: (l) => (
        <span className="flex min-w-0 flex-col">
          <span className="font-medium">{l.productName}</span>
          <span className="font-mono text-caption text-text-secondary">{l.productCode}</span>
        </span>
      ),
    },
    { key: "batchNumber", title: td("cBatch"), mono: true },
    { key: "expiryDate", title: td("cExpiry"), render: (l) => day(l.expiryDate) },
    { key: "fromZone", title: td("cFromZone"), render: () => <ZoneCell name={doc.from.name} /> },
    {
      key: "qty",
      title: td("cQty"),
      align: "right",
      render: (l) => <span className="font-semibold tabular-nums">{formatQuantity(l.qty)}</span>,
    },
    { key: "toZone", title: td("cToZone"), render: () => <ZoneCell name={doc.to.name} /> },
  ];

  const decider = doc.postedBy ?? doc.rejectedBy ?? null;
  const decidedAt = doc.postedAt ?? doc.rejectedAt ?? null;

  return (
    <div className="flex min-w-0 flex-col gap-4 pb-12">
      <DocumentHeader
        parent={{ label: td("parent"), href: "/transfers" }}
        crumb={doc.number}
        crumbMono
        title={t("title")}
        number={doc.number}
        status={<ZoneTransferStatusBadge status={st} />}
        sub={
          <span className="inline-flex items-center gap-1">
            <ArrowLeftRight size={14} strokeWidth={1.5} aria-hidden />
            {place}: {doc.from.name} → {doc.to.name}
          </span>
        }
        meta={<Steps steps={steps} />}
        actions={
          canDecide ? (
            <>
              <RowMenu
                label={td("more")}
                items={[
                  {
                    key: "reject",
                    label: t("reject"),
                    icon: <X size={16} strokeWidth={1.5} aria-hidden />,
                    onSelect: () => setDlg("reject"),
                  },
                ]}
              />
              <Button icon={Check} onClick={() => setDlg("approve")}>
                {t("approve")}
              </Button>
            </>
          ) : undefined
        }
      />
      {st === "PENDING" ? (
        <Alert tone="warning" title={t("bPendingT", { at: at(doc.createdAt), who: doc.createdBy })}>
          {t("bPending", { zone: doc.from.name })}
        </Alert>
      ) : null}
      {st === "POSTED" ? (
        <Alert tone="success" title={t("bPosted", { at: at(doc.postedAt ?? doc.createdAt), who: doc.postedBy ?? doc.createdBy })} />
      ) : null}
      {st === "CANCELLED" ? <Alert tone="info" title={td("bCanc", { at: at(doc.cancelledAt), who: doc.cancelledBy ?? "" })} /> : null}
      {st === "REJECTED" ? (
        <Alert tone="info" title={t("bRej", { at: at(doc.rejectedAt), who: doc.rejectedBy ?? "" })}>
          {t("bRejD", { reason: doc.rejectReason ?? "" })}
        </Alert>
      ) : null}
      <Tabs
        aria-label={t("title")}
        items={[
          { key: "doc", label: td("tabDoc") },
          { key: "hist", label: td("tabHist"), count: events.length },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "doc" ? (
        <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="flex min-w-0 flex-col gap-4">
            <section className="rounded-card border border-border bg-surface">
              <h2 className="border-b border-border px-5 py-4 text-subtitle">{td("info")}</h2>
              <dl className="flex flex-col px-5 py-2">
                <InfoRow k={td("hKind")} v={t("title")} />
                <InfoRow k={td("hDate")} v={formatDate(new Date(doc.createdAt))} />
                <InfoRow k={t("hWh")} v={place} />
                <InfoRow k={td("hFrom")} v={doc.from.name} />
                <InfoRow k={td("hTo")} v={doc.to.name} />
                <InfoRow k={td("hBy")} v={doc.createdBy} />
                {doc.note ? <InfoRow k={td("hNote")} v={doc.note} /> : null}
              </dl>
            </section>
            <section className="rounded-card border border-border bg-surface">
              <h2 className="flex items-center gap-2 px-5 py-4 text-subtitle">
                {td("lines")}
                <span className="font-normal text-text-secondary">{doc.lines.length}</span>
              </h2>
              <Table caption={td("lines")} density="compact" columns={columns} rows={doc.lines} rowKey={(l) => String(l.id)} />
            </section>
          </div>
          <aside className="flex min-w-0 flex-col gap-3">
            <SideCard label={td("sLines")} value={formatQuantity(doc.lines.length)} />
            <SideCard label={td("sQty")} value={formatQuantity(doc.totalQty)} />
            <SideCard label={t("sBy")} value={doc.createdBy} note={`${place} · ${at(doc.createdAt)}`} />
            {doc.needsApproval ? (
              <SideCard label={t("sAppr")} value={decider ?? "—"} note={decidedAt ? at(decidedAt) : t("sApprWho")} muted={!decider} />
            ) : null}
          </aside>
        </div>
      ) : (
        <HistoryTimeline
          query={{ data: events, error: null, refetch: () => 0 }}
          label={(a) =>
            a === "cancelled"
              ? td("h_cancelled")
              : ["create", "draft", "moved", "pending", "posted", "rejected"].includes(a)
                ? t(`h_${a}` as "h_create")
                : a
          }
        />
      )}
      <Modal
        open={dlg === "approve"}
        onClose={() => setDlg(null)}
        title={t("dApprT")}
        primaryAction={{
          label: t("approve"),
          loading: approve.isPending,
          onClick: () =>
            approve.mutate(doc.id, {
              onSuccess: (d) => (setDlg(null), toast({ tone: "success", title: t("tPosted", { n: d.number }) })),
              onError: fail,
            }),
        }}
      >
        <ul className="flex flex-col gap-2 text-body">
          <li className="flex items-start gap-2">
            <Layers size={16} strokeWidth={1.5} aria-hidden className="mt-0.5 shrink-0 text-text-secondary" />
            {t("cfZk", { w: place, a: doc.from.name, b: doc.to.name, q: formatQuantity(doc.totalQty), n: doc.lines.length })}
          </li>
        </ul>
      </Modal>
      <Modal
        open={dlg === "reject"}
        onClose={() => setDlg(null)}
        title={t("dRejT", { n: doc.number })}
        tone="danger"
        primaryAction={{
          label: t("reject"),
          loading: reject.isPending,
          onClick: () => {
            setTried(true);
            if (reason.trim() === "") return;
            reject.mutate(
              { id: doc.id, reason: reason.trim() },
              { onSuccess: () => (setDlg(null), toast({ tone: "success", title: t("tRejected", { n: doc.number }) })), onError: fail },
            );
          },
        }}
      >
        <div className="flex flex-col gap-3">
          <p className="text-body">{t("dRejD")}</p>
          <TextField
            label={t("rejReason")}
            value={reason}
            onChange={setReason}
            placeholder={tz("view.rejectPlaceholder")}
            required
            error={tried && reason.trim() === "" ? t("rejReq") : undefined}
          />
        </div>
      </Modal>
    </div>
  );
}
