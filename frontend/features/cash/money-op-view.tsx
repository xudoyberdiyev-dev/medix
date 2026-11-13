"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, CircleCheck, CircleX, Printer } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DocumentHeader } from "@/components/ui/document-header";
import { HistoryTimeline } from "@/components/ui/history-timeline";
import { ErrorState, ForbiddenState, Skeleton } from "@/components/ui/system-states";
import { Tabs } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { can } from "@/features/auth/can";
import { ensureCsrf, useMe } from "@/features/auth/session";
import { formatIsoDate } from "@/features/counterparties/api";
import { api, ApiError, unwrap } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { formatDateTime, formatMoney } from "@/lib/format";
import { CASH_APPROVE, CASH_CANCEL } from "./api";
import { OpStatusBadge } from "./cash-sections";
import { ReasonDialog, refreshMoney } from "./op-dialogs";

/** Mavjud KO / BO — koʻrish sahifasi (prototip `MoneyOpDoc`, `readView`): maʼlumotlar, chop etish, tasdiqlash / rad etish, bekor qilish. */
export function MoneyOpView({ id }: { id: number }) {
  const t = useTranslations("cash.doc");
  const tc = useTranslations("cash");
  const me = useMe();
  const qc = useQueryClient();
  const allowed = can(me.data, "cash.view");
  const q = useQuery({
    queryKey: ["cash-ops", "one", id],
    queryFn: () => unwrap(api.GET("/api/cash-ops/{id}", { params: { path: { id } } })),
    enabled: allowed,
  });
  const [dialog, setDialog] = useState<"reject" | "cancel" | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"doc" | "hist">("doc");

  if (me.data && !allowed) return <ForbiddenState description={t("forbidden")} />;
  if (q.error) {
    if (q.error instanceof ApiError && q.error.status === 403) return <ForbiddenState description={t("forbidden")} />;
    return <ErrorState onRetry={() => q.refetch()} />;
  }
  const o = q.data;
  if (!o) return <Skeleton className="h-96" />;

  const kind = o.docType === "BO" ? "bo" : "ko";
  const mayApprove = o.status === "PENDING" && can(me.data, CASH_APPROVE);
  const mayCancel = o.status === "POSTED" && o.source === "MANUAL" && can(me.data, CASH_CANCEL);
  async function approve() {
    if (!o) return;
    setBusy(true);
    try {
      await ensureCsrf();
      await unwrap(api.POST("/api/cash-ops/{id}/approve", { params: { path: { id: o.id } } }));
      await refreshMoney(qc);
      toast({
        tone: "success",
        title: tc("pending.approved"),
        description: tc("amountLine", { number: o.number, amount: formatMoney(o.amount) }),
      });
    } catch (e) {
      toast({ tone: "danger", title: tc("pending.approveFailed"), description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  }

  const rows: [string, ReactNode][] = [
    [t("iType"), `${tc(`docType.${o.docType === "BO" ? "BO" : "KO"}`)} · ${tc(o.direction === "IN" ? "col.in" : "col.out")}`],
    [tc("col.account"), o.account],
    [t("hDate"), formatIsoDate(o.opDate)],
    [
      t("hSum"),
      <span key="sum" className="font-mono font-semibold tabular-nums">
        {formatMoney(o.amount)}
      </span>,
    ],
    [tc(`op.item.${o.direction}`), o.source === "CLOSE" ? tc("ops.closeItem", { item: o.item }) : o.item],
    [tc(`op.party.${o.direction}`), o.party ?? "—"],
    [
      t("hBase"),
      o.baseNo ? (
        <span key="base" className="font-mono">
          {o.baseNo}
        </span>
      ) : (
        "—"
      ),
    ],
    [t("hNote"), o.note ?? "—"],
    [t("iBy"), `${o.createdBy} · ${formatDateTime(new Date(o.createdAt))}`],
  ];
  if (o.approvedBy && o.approvedAt) rows.push([t("iApproved"), `${o.approvedBy} · ${formatDateTime(new Date(o.approvedAt))}`]);
  if (o.cancelledBy && o.cancelledAt) rows.push([t("iCancelled"), `${o.cancelledBy} · ${formatDateTime(new Date(o.cancelledAt))}`]);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <DocumentHeader
        parent={{ label: tc("page.title"), href: "/cash" }}
        crumb={o.number}
        crumbMono
        title={t(`title.${kind}`)}
        number={o.number}
        status={<OpStatusBadge status={o.status} />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" icon={Printer} onClick={() => window.open(`/api/cash-ops/${o.id}/pdf`, "_blank", "noopener")}>
              {tc("print")}
            </Button>
            {mayCancel ? (
              <Button variant="secondary" icon={Ban} onClick={() => setDialog("cancel")}>
                {tc("cancel")}
              </Button>
            ) : null}
            {mayApprove ? (
              <>
                <Button variant="secondary" icon={CircleX} onClick={() => setDialog("reject")}>
                  {tc("pending.reject")}
                </Button>
                <Button icon={CircleCheck} loading={busy} onClick={() => void approve()}>
                  {tc("pending.approve")}
                </Button>
              </>
            ) : null}
          </div>
        }
      />
      {o.status === "PENDING" ? <Alert tone="warning" title={tc("pending.atManager")} /> : null}
      {o.cancelReason ? <Alert tone={o.status === "REJECTED" ? "danger" : "info"} title={`${tc("reason")}: ${o.cancelReason}`} /> : null}
      <Tabs
        items={[
          { key: "doc", label: t("tabDoc") },
          { key: "hist", label: t("tabHist") },
        ]}
        value={tab}
        onChange={(k) => setTab(k === "hist" ? "hist" : "doc")}
      />
      {tab === "hist" ? <CashOpHistory id={o.id} /> : null}
      <div className={cn("grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]", tab === "hist" && "hidden")}>
        <section className="rounded-card border border-border bg-surface p-5 shadow-[0_1px_2px_rgba(18,60,58,0.04)]">
          <h2 className="mb-4 text-subtitle">{t("iHead")}</h2>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            {rows.map(([k, v]) => (
              <div key={k} className="flex min-w-0 flex-col gap-0.5">
                <dt className="text-caption text-text-secondary">{k}</dt>
                <dd className="text-body break-words">{v}</dd>
              </div>
            ))}
          </dl>
        </section>
        <aside className="flex min-w-0 flex-col gap-2 rounded-card border border-border bg-surface px-4 py-3 shadow-[0_1px_2px_rgba(18,60,58,0.04)]">
          <span className="text-caption text-text-secondary">{tc(o.direction === "IN" ? "col.in" : "col.out")}</span>
          <span className="font-mono text-[20px] leading-7 font-semibold tabular-nums">{formatMoney(o.amount)}</span>
          <span className="text-caption text-text-secondary">{o.account}</span>
        </aside>
      </div>
      {dialog ? (
        <ReasonDialog
          title={dialog === "cancel" ? tc("cancelTitle", { number: o.number }) : tc("pending.rejectTitle", { number: o.number })}
          action={dialog === "cancel" ? tc("cancel") : tc("pending.reject")}
          onSubmit={async (reason) => {
            await ensureCsrf();
            if (dialog === "cancel") {
              await unwrap(api.POST("/api/cash-ops/{id}/cancel", { params: { path: { id: o.id } }, body: { reason } }));
              toast({ tone: "success", title: tc("ops.cancelled"), description: o.number });
            } else {
              await unwrap(api.POST("/api/cash-ops/{id}/reject", { params: { path: { id: o.id } }, body: { reason } }));
              toast({ tone: "success", title: tc("pending.rejected"), description: o.number });
            }
            await refreshMoney(qc);
          }}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </div>
  );
}

const HISTORY: Record<string, "h_create" | "h_approve" | "h_reject" | "h_cancel"> = {
  create: "h_create",
  approve: "h_approve",
  reject: "h_reject",
  cancel: "h_cancel",
};

/** «Tarix» yorligʻi (prototip `MoneyOpDoc` → `HistoryTimeline`): audit jurnalidan, kunlar boʻyicha. */
function CashOpHistory({ id }: { id: number }) {
  const t = useTranslations("cash.doc");
  const q = useQuery({
    queryKey: ["cash-ops", "history", id],
    queryFn: () => unwrap(api.GET("/api/cash-ops/{id}/history", { params: { path: { id } } })),
  });
  const data = q.data?.map((e) => ({ ...e, employee: e.employee ?? undefined, reason: e.reason ?? undefined }));
  return (
    <HistoryTimeline
      query={{ data, error: q.error, refetch: q.refetch }}
      label={(a) => {
        const k = HISTORY[a.split(".").pop() ?? ""];
        return k ? t(k) : a;
      }}
    />
  );
}
