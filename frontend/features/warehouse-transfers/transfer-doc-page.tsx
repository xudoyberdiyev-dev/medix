"use client";

import { ArrowLeftRight, Layers, PackageCheck, Truck, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DocumentHeader } from "@/components/ui/document-header";
import { HistoryTimeline } from "@/components/ui/history-timeline";
import { Modal } from "@/components/ui/modal";
import { RowMenu } from "@/components/ui/row-menu";
import { ErrorState, ForbiddenState, Skeleton } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { can, canAny } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { useBranchList } from "@/features/organization/api";
import { Steps } from "@/features/payments/payment-doc-page";
import { describeError } from "@/features/setup/form-error";
import { cn } from "@/lib/cn";
import { formatDate, formatDateTime, formatQuantity } from "@/lib/format";
import {
  OK_VIEW_KEYS,
  TRANSFER_CANCEL,
  TRANSFER_RECEIVE,
  TRANSFER_SEND,
  useCancelWarehouseTransfer,
  useSendWarehouseTransfer,
  useWarehouseTransfer,
  type TransferLine,
  type WarehouseTransferDetail,
} from "./api";
import { okHistory, okSteps } from "./doc-model";
import { ShortagePanel } from "./shortage-panel";
import { WarehouseTransferStatusBadge } from "./warehouse-transfers-page";

const day = (iso: string) => formatDate(new Date(`${iso}T00:00:00+05:00`));

/** OK — ombor koʻchirish hujjati toʻliq sahifa (prototip `TransferDoc`, kind = ok). */
export function WarehouseTransferDocPage({ id }: { id: number }) {
  const t = useTranslations("warehouseTransfers.doc");
  const me = useMe();
  const doc = useWarehouseTransfer(id);
  if (me.data && !canAny(me.data, OK_VIEW_KEYS)) return <ForbiddenState />;
  if (doc.error) return <ErrorState onRetry={() => doc.refetch()} />;
  if (!doc.data)
    return (
      <div className="flex flex-col gap-4" aria-label={t("loading")}>
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  return <View doc={doc.data} />;
}

function View({ doc }: { doc: WarehouseTransferDetail }) {
  const t = useTranslations("warehouseTransfers.doc");
  const tw = useTranslations("warehouseTransfers");
  const tr = useTranslations("warehouseTransfers.rcv");
  const me = useMe();
  const branches = useBranchList();
  const send = useSendWarehouseTransfer();
  const cancel = useCancelWarehouseTransfer();
  const router = useRouter();
  const [tab, setTab] = useState("doc");
  const [dlg, setDlg] = useState<"send" | "cancel" | null>(null);
  const fail = (e: unknown) => toast({ tone: "danger", title: tw("failed"), description: describeError(e).message ?? tw("retryHint") });

  const st = doc.status;
  const branch = branches.data?.find((b) => b.id === doc.branchId)?.name ?? "";
  const place = (w: string) => (branch ? `${branch} · ${w}` : w);
  const fromPlace = place(doc.fromWarehouse.name);
  const toPlace = place(doc.toWarehouse.name);
  const canSend = st === "DRAFT" && can(me.data, TRANSFER_SEND);
  const canCancel = st === "DRAFT" && can(me.data, TRANSFER_CANCEL);
  const canReceive = st === "IN_TRANSIT" && can(me.data, TRANSFER_RECEIVE);
  const received = st === "RECEIVED";
  const diff = received && doc.shortageQty > 0;
  const steps = okSteps(st).map((s) => ({ label: t(`step.${s.key}`), state: s.state }));
  const events = okHistory(doc);
  const at = (iso?: string | null) => (iso ? formatDateTime(new Date(iso)) : "");

  const columns: TableColumn<TransferLine>[] = [
    { key: "lineNo", title: "№", render: (l) => <span className="text-text-secondary">{l.lineNo}</span> },
    {
      key: "productName",
      title: t("cProduct"),
      wrap: true,
      render: (l) => (
        <span className="flex min-w-0 flex-col">
          <span className="font-medium">{l.productName}</span>
          <span className="font-mono text-caption text-text-secondary">{l.productCode}</span>
        </span>
      ),
    },
    { key: "batchNumber", title: t("cBatch"), mono: true },
    { key: "expiryDate", title: t("cExpiry"), render: (l) => day(l.expiryDate) },
    { key: "fromZone", title: t("cFromZone"), render: () => <ZoneCell name={doc.fromZone.name} /> },
    {
      key: "qty",
      title: received ? t("cSent") : t("cQty"),
      align: "right",
      render: (l) => <span className="font-semibold tabular-nums">{formatQuantity(l.qty)}</span>,
    },
    ...(received
      ? [
          {
            key: "receivedQty",
            title: t("cReceived"),
            align: "right" as const,
            render: (l: TransferLine) => <span className="tabular-nums">{formatQuantity(l.receivedQty ?? 0)}</span>,
          },
          {
            key: "reason",
            title: t("cReason"),
            wrap: true,
            render: (l: TransferLine) =>
              l.reason ? (
                <span className="flex flex-col">
                  <span>{tr(`r_${l.reason as "SHORT"}`)}</span>
                  {l.damagedQty > 0 ? (
                    <span className="text-caption text-warning">{t("dmgQuar", { q: formatQuantity(l.damagedQty) })}</span>
                  ) : null}
                </span>
              ) : (
                "—"
              ),
          },
          {
            key: "diff",
            title: t("cDiff"),
            align: "right" as const,
            render: (l: TransferLine) => {
              const d = (l.receivedQty ?? 0) - l.qty;
              return d ? <span className="font-semibold text-danger tabular-nums">{formatQuantity(d)}</span> : "—";
            },
          },
        ]
      : []),
    {
      key: "toZone",
      title: t("cToZone"),
      render: (l) => {
        const z = l.toZone ?? doc.toZone;
        return z ? <ZoneCell name={z.name} /> : <span className="text-text-secondary">{t("toZoneOnReceive")}</span>;
      },
    },
  ];

  const menu = canCancel
    ? [{ key: "cancel", label: t("cancel"), icon: <X size={16} strokeWidth={1.5} aria-hidden />, onSelect: () => setDlg("cancel") }]
    : [];

  return (
    <div className="flex min-w-0 flex-col gap-4 pb-12">
      <DocumentHeader
        parent={{ label: t("parent"), href: "/transfers" }}
        crumb={doc.number}
        crumbMono
        title={t("title")}
        number={doc.number}
        status={<WarehouseTransferStatusBadge status={st} />}
        sub={
          <span className="inline-flex items-center gap-1">
            <ArrowLeftRight size={14} strokeWidth={1.5} aria-hidden />
            {fromPlace} → {toPlace}
          </span>
        }
        meta={<Steps steps={steps} />}
        actions={
          <>
            {menu.length ? <RowMenu items={menu} label={t("more")} /> : null}
            {canSend ? (
              <Button icon={Truck} loading={send.isPending} onClick={() => setDlg("send")}>
                {t("send")}
              </Button>
            ) : null}
            {canReceive ? (
              <Button icon={PackageCheck} onClick={() => router.push(`/warehouse-transfers/${doc.id}/receive`)}>
                {t("receive")}
              </Button>
            ) : null}
          </>
        }
      />
      {st === "DRAFT" ? (
        <Alert tone="info" title={t("bDraftT")}>
          {t("bDraft")}
        </Alert>
      ) : null}
      {st === "IN_TRANSIT" ? (
        <Alert tone="info" title={t("bTransitT", { at: at(doc.sentAt), who: doc.sentBy ?? "" })}>
          {t("bTransit")}
        </Alert>
      ) : null}
      {received && !diff ? (
        <Alert tone="success" title={t("bRecv", { at: at(doc.receivedAt), who: doc.receivedBy ?? "", to: toPlace })} />
      ) : null}
      {diff ? (
        <Alert tone="warning" title={t("bDiffT", { at: at(doc.receivedAt), who: doc.receivedBy ?? "" })}>
          {t("bDiff", { q: formatQuantity(doc.shortageQty) })}
        </Alert>
      ) : null}
      {st === "CANCELLED" ? <Alert tone="info" title={t("bCanc", { at: at(doc.cancelledAt), who: doc.cancelledBy ?? "" })} /> : null}
      <ShortagePanel doc={doc} />
      <Tabs
        aria-label={t("title")}
        items={[
          { key: "doc", label: t("tabDoc") },
          { key: "hist", label: t("tabHist"), count: events.length },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "doc" ? (
        <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="flex min-w-0 flex-col gap-4">
            <section className="rounded-card border border-border bg-surface">
              <h2 className="border-b border-border px-5 py-4 text-subtitle">{t("info")}</h2>
              <dl className="flex flex-col px-5 py-2">
                <InfoRow k={t("hKind")} v={t("title")} />
                <InfoRow k={t("hDate")} v={formatDate(new Date(doc.createdAt))} />
                <InfoRow k={t("hFrom")} v={fromPlace} />
                <InfoRow k={t("hTo")} v={toPlace} />
                <InfoRow k={t("hBy")} v={doc.createdBy} />
                {doc.note ? <InfoRow k={t("hNote")} v={doc.note} /> : null}
                {doc.receiveNote ? <InfoRow k={t("hRecvNote")} v={doc.receiveNote} /> : null}
              </dl>
            </section>
            <section className="rounded-card border border-border bg-surface">
              <h2 className="flex items-center gap-2 px-5 py-4 text-subtitle">
                {t("lines")}
                <span className="font-normal text-text-secondary">{doc.lines.length}</span>
              </h2>
              <Table caption={t("lines")} density="compact" columns={columns} rows={doc.lines} rowKey={(l) => String(l.id)} />
            </section>
          </div>
          <aside className="flex min-w-0 flex-col gap-3">
            <SideCard label={t("sLines")} value={formatQuantity(doc.lines.length)} />
            <SideCard label={t("sQty")} value={formatQuantity(doc.totalQty)} />
            <SideCard
              label={t("sSender")}
              value={doc.sentBy ?? "—"}
              note={doc.sentAt ? `${fromPlace} · ${at(doc.sentAt)}` : fromPlace}
              muted={!doc.sentBy}
            />
            <SideCard
              label={t("sReceiver")}
              value={doc.receivedBy ?? "—"}
              note={doc.receivedAt ? `${toPlace} · ${at(doc.receivedAt)}` : toPlace}
              muted={!doc.receivedBy}
            />
          </aside>
        </div>
      ) : (
        <HistoryTimeline
          query={{ data: events, error: null, refetch: () => 0 }}
          label={(a) => (["create", "transit", "received", "diff", "cancelled"].includes(a) ? t(`h_${a}` as "h_create") : a)}
        />
      )}
      <Modal
        open={dlg === "send"}
        onClose={() => setDlg(null)}
        title={t("dSendT")}
        primaryAction={{
          label: t("send"),
          loading: send.isPending,
          onClick: () =>
            send.mutate(doc.id, {
              onSuccess: (d) => (setDlg(null), toast({ tone: "success", title: t("tSent", { n: d.number }) })),
              onError: fail,
            }),
        }}
      >
        <ul className="flex flex-col gap-2 text-body">
          <li className="flex items-start gap-2">
            <Truck size={16} strokeWidth={1.5} aria-hidden className="mt-0.5 shrink-0 text-text-secondary" />
            {t("cfSend", { w: fromPlace, q: formatQuantity(doc.totalQty), n: doc.lines.length })}
          </li>
          <li className="flex items-start gap-2">
            <Layers size={16} strokeWidth={1.5} aria-hidden className="mt-0.5 shrink-0 text-text-secondary" />
            {t("cfTransit", { to: toPlace })}
          </li>
        </ul>
      </Modal>
      <Modal
        open={dlg === "cancel"}
        onClose={() => setDlg(null)}
        title={t("dCancT", { n: doc.number })}
        tone="danger"
        primaryAction={{
          label: t("cancel"),
          loading: cancel.isPending,
          onClick: () =>
            cancel.mutate(doc.id, {
              onSuccess: () => (setDlg(null), toast({ tone: "success", title: t("tCancelled", { n: doc.number }) })),
              onError: fail,
            }),
        }}
      >
        <p className="text-body">{t("dCanc")}</p>
      </Modal>
    </div>
  );
}

export function InfoRow({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,180px)_minmax(0,1fr)] gap-4 border-b border-border py-2.5 last:border-b-0">
      <dt className="text-caption text-text-secondary">{k}</dt>
      <dd className="min-w-0 break-words text-body">{v}</dd>
    </div>
  );
}

export function ZoneCell({ name }: { name: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Layers size={14} strokeWidth={1.5} aria-hidden className="shrink-0 text-text-secondary" />
      <span className="truncate">{name}</span>
    </span>
  );
}

export function SideCard({ label, value, note, muted }: { label: string; value: string; note?: string; muted?: boolean }) {
  return (
    <section className="flex min-w-0 flex-col gap-1 rounded-card border border-border bg-surface p-4">
      <p className="text-caption text-text-secondary">{label}</p>
      <p className={cn("truncate text-[22px] leading-7 font-semibold tabular-nums", muted && "text-text-secondary")}>{value}</p>
      {note ? <p className="truncate text-caption text-text-secondary">{note}</p> : null}
    </section>
  );
}
