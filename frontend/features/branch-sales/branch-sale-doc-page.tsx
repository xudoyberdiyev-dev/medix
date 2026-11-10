"use client";

import { ArrowLeftRight, PackageCheck, Printer, Receipt, Truck, X } from "lucide-react";
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
import { toast } from "@/components/ui/toast";
import { can, canAny } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { Steps } from "@/features/payments/payment-doc-page";
import { describeError } from "@/features/setup/form-error";
import { TRANSFER_CANCEL, TRANSFER_RECEIVE, TRANSFER_SEND } from "@/features/warehouse-transfers/api";
import { okHistory, okSteps } from "@/features/warehouse-transfers/doc-model";
import { InfoRow, SideCard, ZoneCell } from "@/features/warehouse-transfers/transfer-doc-page";
import { WarehouseTransferStatusBadge } from "@/features/warehouse-transfers/warehouse-transfers-page";
import { formatDate, formatDateTime, formatMoney, formatQuantity } from "@/lib/format";
import { FS_VIEW_KEYS, useBranchSale, useCancelBranchSale, useSendBranchSale, type BranchSaleDetail, type BranchSaleLine } from "./api";
import { BranchSaleReceiveModal } from "./branch-sale-drawer";
import { BranchSaleShortagePanel } from "./shortage-panel";

const day = (iso: string) => formatDate(new Date(`${iso}T00:00:00+05:00`));

/** FS — filiallararo savdo hujjati toʻliq sahifa (prototip `TransferDoc`, kind = fs): hisob-faktura, tannarxda summa va QQS. */
export function BranchSaleDocPage({ id }: { id: number }) {
  const t = useTranslations("warehouseTransfers.doc");
  const me = useMe();
  const doc = useBranchSale(id);
  if (me.data && !canAny(me.data, FS_VIEW_KEYS)) return <ForbiddenState />;
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

function View({ doc }: { doc: BranchSaleDetail }) {
  const t = useTranslations("warehouseTransfers.doc");
  const tw = useTranslations("warehouseTransfers");
  const tb = useTranslations("branchSales");
  const tf = useTranslations("branchSales.doc");
  const me = useMe();
  const send = useSendBranchSale();
  const cancel = useCancelBranchSale();
  const [tab, setTab] = useState("doc");
  const [dlg, setDlg] = useState<"send" | "cancel" | "receive" | null>(null);
  const fail = (e: unknown) => toast({ tone: "danger", title: tw("failed"), description: describeError(e).message ?? tw("retryHint") });

  // Server ham tekshiradi: joʻnatish / bekor qilish — sotuvchi filial, qabul — xaridor filial
  const side = (branch: number) => Boolean(me.data?.allBranches) || me.data?.branchId === branch;
  const st = doc.status;
  const fromPlace = `${doc.seller.name} · ${doc.fromWarehouse.name}`;
  const toPlace = `${doc.buyer.name} · ${doc.toWarehouse.name}`;
  const canSend = st === "DRAFT" && can(me.data, TRANSFER_SEND) && side(doc.seller.id);
  const canCancel = st === "DRAFT" && can(me.data, TRANSFER_CANCEL) && side(doc.seller.id);
  const canReceive = st === "IN_TRANSIT" && can(me.data, TRANSFER_RECEIVE) && side(doc.buyer.id);
  const received = st === "RECEIVED";
  const diff = received && doc.shortageQty > 0;
  const money = Boolean(doc.total);
  const steps = okSteps(st).map((s) => ({ label: t(`step.${s.key}`), state: s.state }));
  const events = okHistory(doc);
  const at = (iso?: string | null) => (iso ? formatDateTime(new Date(iso)) : "");
  const print = () => window.open(`/api/branch-sales/${doc.id}/pdf`, "_blank", "noopener");

  const columns: TableColumn<BranchSaleLine>[] = [
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
            render: (l: BranchSaleLine) => <span className="tabular-nums">{formatQuantity(l.receivedQty ?? 0)}</span>,
          },
          {
            key: "diff",
            title: t("cDiff"),
            align: "right" as const,
            render: (l: BranchSaleLine) => {
              const d = (l.receivedQty ?? 0) - l.qty;
              return d ? <span className="font-semibold text-danger tabular-nums">{formatQuantity(d)}</span> : "—";
            },
          },
        ]
      : []),
    {
      key: "toZone",
      title: t("cToZone"),
      render: () =>
        doc.toZone ? <ZoneCell name={doc.toZone.name} /> : <span className="text-text-secondary">{t("toZoneOnReceive")}</span>,
    },
    ...(money
      ? [
          {
            key: "unitCost",
            title: tb("col.unitCost"),
            align: "right" as const,
            render: (l: BranchSaleLine) => <span className="tabular-nums">{l.unitCost ? formatMoney(l.unitCost) : "—"}</span>,
          },
          {
            key: "amount",
            title: tb("col.amount"),
            align: "right" as const,
            render: (l: BranchSaleLine) => <span className="tabular-nums">{l.amount ? formatMoney(l.amount) : "—"}</span>,
          },
        ]
      : []),
  ];

  const menu = [
    { key: "print", label: tf("printInv"), icon: <Printer size={16} strokeWidth={1.5} aria-hidden />, onSelect: print },
    ...(canCancel
      ? [{ key: "cancel", label: t("cancel"), icon: <X size={16} strokeWidth={1.5} aria-hidden />, onSelect: () => setDlg("cancel") }]
      : []),
  ];

  return (
    <div className="flex min-w-0 flex-col gap-4 pb-12">
      <DocumentHeader
        parent={{ label: t("parent"), href: "/transfers" }}
        crumb={doc.number}
        crumbMono
        title={tf("title")}
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
            <RowMenu items={menu} label={t("more")} />
            {canSend ? (
              <Button icon={Truck} loading={send.isPending} onClick={() => setDlg("send")}>
                {t("send")}
              </Button>
            ) : null}
            {canReceive ? (
              <Button icon={PackageCheck} onClick={() => setDlg("receive")}>
                {t("receive")}
              </Button>
            ) : null}
          </>
        }
      />
      {st === "DRAFT" ? (
        <Alert tone="info" title={t("bDraftT")}>
          {tb("view.draftBody", { zone: doc.fromZone.name, hf: "HF", buyer: doc.buyer.name })}
        </Alert>
      ) : null}
      {st === "IN_TRANSIT" ? (
        <Alert tone="info" title={t("bTransitT", { at: at(doc.sentAt), who: doc.sentBy ?? "" })}>
          {tb("view.transitBody", { who: doc.sentBy ?? "", at: at(doc.sentAt), buyer: doc.buyer.name })}
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
      <BranchSaleShortagePanel doc={doc} />
      <Tabs
        aria-label={tf("title")}
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
                <InfoRow k={t("hKind")} v={tf("title")} />
                <InfoRow k={t("hDate")} v={formatDate(new Date(doc.createdAt))} />
                <InfoRow k={tb("view.seller")} v={`${fromPlace} · ${doc.fromZone.name}`} />
                <InfoRow k={tb("view.buyer")} v={doc.toZone ? `${toPlace} · ${doc.toZone.name}` : toPlace} />
                <InfoRow k={tb("view.invoice")} v={<span className="font-mono">{doc.invoiceNumber ?? tf("invAuto")}</span>} />
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
            {money && doc.total ? <SideCard label={tb("view.total")} value={formatMoney(doc.total)} /> : null}
            {money && doc.vatTotal ? <SideCard label={tb("view.vat")} value={formatMoney(doc.vatTotal)} /> : null}
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
              onSuccess: (d) => (
                setDlg(null),
                toast({ tone: "success", title: t("tSent", { n: d.number }), description: d.invoiceNumber ?? "" })
              ),
              onError: fail,
            }),
        }}
      >
        <ul className="flex flex-col gap-2 text-body">
          <li className="flex items-start gap-2">
            <Truck size={16} strokeWidth={1.5} aria-hidden className="mt-0.5 shrink-0 text-text-secondary" />
            {t("cfSend", { w: `${fromPlace} · ${doc.fromZone.name}`, q: formatQuantity(doc.totalQty), n: doc.lines.length })}
          </li>
          <li className="flex items-start gap-2">
            <Receipt size={16} strokeWidth={1.5} aria-hidden className="mt-0.5 shrink-0 text-text-secondary" />
            {tf("cfInv", { buyer: doc.buyer.name })}
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
      {dlg === "receive" ? <BranchSaleReceiveModal doc={doc} onClose={() => setDlg(null)} /> : null}
    </div>
  );
}
