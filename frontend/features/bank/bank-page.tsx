"use client";

import { AlertTriangle, ArrowLeftRight, CheckCircle2, CreditCard, Landmark, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, ForbiddenState, Skeleton } from "@/components/ui/system-states";
import { Tabs } from "@/components/ui/tabs";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { BankReconTab } from "@/features/cash/bank-recon";
import { StatementTab } from "@/features/cash/cash-sections";
import { useAccounts } from "@/features/payments/api";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { cn } from "@/lib/cn";
import { formatMoney, formatQuantity } from "@/lib/format";
import { useBranchStore } from "@/lib/stores/branch";
import { groupAccountNo, isoToDay } from "./model";

type BankCard = components["schemas"]["BankCard"];

/** «Bank» (prototip `Bank`): bank hisoblari va terminallar kartalari, «Ichki oʻtkazma», «Bank operatsiyasi»; tanlangan hisob — koʻchirma va solishtirish. */
export function BankPage() {
  const t = useTranslations("bank");
  const me = useMe();
  const router = useRouter();
  const selectedBranch = useBranchStore((s) => s.branchId);
  const allowed = can(me.data, "bank.view");
  const branchId = me.data?.allBranches ? (selectedBranch ?? null) : (me.data?.branchId ?? null);
  const q = useQuery({
    queryKey: ["bank", "overview", branchId],
    queryFn: () => unwrap(api.GET("/api/bank/overview", { params: { query: { branchId: branchId ?? undefined } } })),
    enabled: allowed,
  });
  const [selected, setSelected] = useState<number | null>(null);
  const [tab, setTab] = useState("statement");
  const cards = q.data?.cards ?? [];
  const current = cards.find((c) => c.id === selected) ?? null;
  const accounts = useAccounts(allowed && current ? current.branchId : null);
  const canOp = can(me.data, "cash.io") || can(me.data, "payments.noncash");

  if (me.data && !allowed) return <ForbiddenState description={t("forbidden")} />;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="flex items-baseline gap-2 text-page-title">
            {t("title")}
            {q.data ? <span className="tabular text-body text-text-secondary">{formatQuantity(cards.length)}</span> : null}
          </h1>
          {q.data ? <p className="text-table text-text-secondary">{t("sub", { sum: formatMoney(q.data.total) })}</p> : null}
        </div>
        {canOp ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              icon={ArrowLeftRight}
              onClick={() => router.push(`/cash/ops/new?kind=io${current ? `&acct=${current.id}` : ""}`)}
            >
              {t("transfer")}
            </Button>
            <Button icon={Plus} onClick={() => router.push(`/cash/ops/new?kind=bo${current ? `&acct=${current.id}` : ""}`)}>
              {t("newOp")}
            </Button>
          </div>
        ) : null}
      </div>
      {q.error ? (
        <div className="rounded-card border border-border bg-surface">
          <ErrorState onRetry={() => q.refetch()} />
        </div>
      ) : !q.data ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : cards.length === 0 ? (
        <div className="rounded-card border border-border bg-surface">
          <EmptyState icon={Landmark} title={t("emptyTitle")} description={t("emptyDescription")} />
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3">
          {cards.map((c) => (
            <Card key={c.id} c={c} active={c.id === selected} onOpen={() => setSelected(c.id === selected ? null : c.id)} />
          ))}
        </div>
      )}
      <Alert tone="info" title={t("integrationTitle")}>
        {t("integrationText")}
      </Alert>
      {current ? (
        <section aria-label={t("selectedLabel", { name: current.name })} className="flex flex-col gap-3">
          <Tabs
            aria-label={t("tabsLabel")}
            value={current.kind === "BANK" ? tab : "statement"}
            onChange={setTab}
            items={[
              { key: "statement", label: t("tabStatement") },
              ...(current.kind === "BANK" ? [{ key: "recon", label: t("tabRecon") }] : []),
            ]}
          />
          {tab === "recon" && current.kind === "BANK" ? (
            accounts.data ? (
              <BankReconTab key={current.id} accounts={accounts.data.filter((a) => a.id === current.id)} canEdit={canOp} />
            ) : (
              <Skeleton className="h-40 w-full" />
            )
          ) : (
            <StatementTab accountId={current.id} />
          )}
        </section>
      ) : null}
    </div>
  );
}

function Card({ c, active, onOpen }: { c: BankCard; active: boolean; onOpen: () => void }) {
  const t = useTranslations("bank");
  const Icon = c.kind === "BANK" ? Landmark : CreditCard;
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onOpen}
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-card border bg-surface p-4 text-left transition-colors hover:border-text-disabled",
        active ? "border-primary ring-1 ring-primary" : "border-border",
      )}
    >
      <span className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-control bg-background text-text-secondary">
          <Icon size={16} strokeWidth={1.5} aria-hidden />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium">{c.name}</span>
          <span className="truncate text-caption text-text-secondary">{c.branchName}</span>
        </span>
        {c.reconciledOn ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-sm bg-success-bg px-2 py-0.5 text-caption text-success">
            <CheckCircle2 size={14} strokeWidth={1.5} aria-hidden />
            {t("reconciled", { date: isoToDay(c.reconciledOn) })}
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-sm bg-warning-bg px-2 py-0.5 text-caption text-warning">
            <AlertTriangle size={14} strokeWidth={1.5} aria-hidden />
            {t("notReconciled")}
          </span>
        )}
      </span>
      {c.accountNo ? <span className="tabular font-mono text-table text-text-secondary">{groupAccountNo(c.accountNo)}</span> : null}
      <span className="tabular text-[28px] leading-9 font-semibold">{formatMoney(c.balance)}</span>
      <span className="text-table text-text-secondary">{c.lastMove ? t("lastMove", { date: isoToDay(c.lastMove) }) : t("noMoves")}</span>
    </button>
  );
}
