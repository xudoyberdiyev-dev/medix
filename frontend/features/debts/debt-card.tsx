"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { AlarmClock, ArrowDownLeft, ArrowUpRight, CircleCheck, FileCheck2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DocumentHeader } from "@/components/ui/document-header";
import { EmptyState, ErrorState, ForbiddenState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { formatIsoDate, useCounterparty } from "@/features/counterparties/api";
import { StatusBadge as ReconStatusBadge } from "@/features/reconciliations/recon-pages";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import { useBranchStore } from "@/lib/stores/branch";
import { ActSection } from "./act-section";
import { AdvanceOffsetButton } from "./advance-offset";
import { DebtStatusBadge } from "./receivables";
import { cardTotals, limitLeft, usedPct, type CardDoc } from "./receivables-model";

type Side = "CUSTOMER" | "SUPPLIER";
type DebtRow = components["schemas"]["DebtRow"];
type ReconRow = components["schemas"]["ReconRow"];
type CardTab = "open" | "moves" | "recons";

const PATH = { CUSTOMER: "customers", SUPPLIER: "suppliers" } as const;
const PERM = { CUSTOMER: "cdebt.view", SUPPLIER: "sdebt.view" } as const;

const amount = (v: string) =>
  v === "0.00" ? <span className="text-text-secondary">—</span> : <span className="tabular-nums">{formatMoney(v)}</span>;

/** Qarz kartochkasi (prototip `DebtCard`): ochiq hujjatlar, harakatlar (akt sverka koʻrinishi), akt sverkalar; oʻngda KPI. */
export function DebtCardPage({ side, id, name }: { side: Side; id: number; name: string | null }) {
  const t = useTranslations("debts.card");
  const td = useTranslations("debts");
  const router = useRouter();
  const me = useMe();
  const selectedBranch = useBranchStore((s) => s.branchId);
  const branchId = me.data?.allBranches ? (selectedBranch ?? null) : (me.data?.branchId ?? null);
  const allowed = can(me.data, PERM[side]);
  const [tab, setTab] = useState<CardTab>("open");
  const yt = side === "SUPPLIER";

  const report = useQuery({
    queryKey: ["debts", PATH[side], branchId],
    queryFn: () =>
      side === "CUSTOMER"
        ? unwrap(api.GET("/api/debts/customers", { params: { query: { branchId: branchId ?? undefined } } }))
        : unwrap(api.GET("/api/debts/suppliers", { params: { query: { branchId: branchId ?? undefined } } })),
    enabled: !!me.data && allowed,
  });
  const docs = useQuery({
    queryKey: ["debts", PATH[side], "docs", id, branchId],
    queryFn: () => {
      const params = { path: { id }, query: { branchId: branchId ?? undefined } };
      return side === "CUSTOMER"
        ? unwrap(api.GET("/api/debts/customers/{id}/docs", { params }))
        : unwrap(api.GET("/api/debts/suppliers/{id}/docs", { params }));
    },
    enabled: !!me.data && allowed,
  });
  const canRecon = can(me.data, "recon.view");
  const recons = useQuery({
    queryKey: ["reconciliations", branchId],
    queryFn: () => unwrap(api.GET("/api/reconciliations", { params: { query: { branchId: branchId ?? undefined } } })),
    enabled: !!me.data && canRecon,
  });

  // Qarzi yoʻq kontragent (hisobotda qatori yoʻq) — nomi kartochkadan.
  const party = useCounterparty(name ? null : id);

  if (me.data && !allowed) return <ForbiddenState description={td("forbidden", { title: td(`side.${side}.title`) })} />;
  if (report.error || docs.error) {
    return (
      <ErrorState
        onRetry={() => {
          void report.refetch();
          void docs.refetch();
        }}
      />
    );
  }

  const row: DebtRow | undefined = report.data?.rows.find((r) => r.counterpartyId === id);
  const open: CardDoc[] = (docs.data ?? []).filter((d) => !d.open.startsWith("-") && d.open !== "0.00");
  const myRecons = (recons.data?.rows ?? []).filter((r) => r.counterpartyId === id && r.side === side);
  const title = row?.name ?? name ?? party.data?.name ?? "";
  const parentHref = `/debts/${PATH[side]}`;
  const sums = cardTotals(open);
  const debt = row?.buckets.debt ?? "0.00";
  const overdue = row?.buckets.overdue ?? "0.00";
  const advance = row?.buckets.advance ?? "0.00";

  const docCols: TableColumn<CardDoc>[] = [
    {
      key: "docNumber",
      title: yt ? t("col.rcNo") : t("col.saleNo"),
      mono: true,
      pinned: true,
      render: (d) =>
        d.docType === "KR" ? (
          <Link href={`/receipts/${d.docId}`} className="text-primary hover:underline">
            {d.docNumber}
          </Link>
        ) : (
          d.docNumber
        ),
    },
    { key: "date", title: t("col.date"), render: (d) => <span className="text-text-secondary">{formatIsoDate(d.date)}</span> },
    ...(branchId == null ? [{ key: "branch", title: t("col.branch") }] : []),
    {
      key: "dueDate",
      title: t("col.due"),
      render: (d) => <span className={cn(d.overdueDays > 0 && "text-danger")}>{formatIsoDate(d.dueDate)}</span>,
    },
    { key: "total", title: t("col.sum"), align: "right", render: (d) => amount(d.total) },
    { key: "returned", title: t("col.ret"), align: "right", render: (d) => amount(d.returned) },
    { key: "paid", title: t("col.paid"), align: "right", render: (d) => amount(d.paid) },
    {
      key: "open",
      title: t("col.left"),
      align: "right",
      render: (d) => <span className="font-semibold tabular-nums">{formatMoney(d.open)}</span>,
    },
    {
      key: "overdueDays",
      title: t("col.late"),
      render: (d) =>
        d.overdueDays > 0 ? (
          <Badge tone="danger" icon={AlarmClock}>
            {t("lateV", { n: d.overdueDays })}
          </Badge>
        ) : (
          <span className="text-text-secondary">—</span>
        ),
    },
  ];
  const reconCols: TableColumn<ReconRow>[] = [
    { key: "number", title: t("col.asNo"), mono: true },
    {
      key: "period",
      title: t("col.period"),
      render: (r) => <span className="text-text-secondary">{`${formatIsoDate(r.from)} – ${formatIsoDate(r.to)}`}</span>,
    },
    {
      key: "closing",
      title: t("col.final"),
      align: "right",
      render: (r) => <span className="font-semibold tabular-nums">{formatMoney(r.closing)}</span>,
    },
    { key: "status", title: t("col.st"), render: (r) => <ReconStatusBadge status={r.status} /> },
    { key: "createdBy", title: t("col.by"), render: (r) => <span className="text-text-secondary">{r.createdBy}</span> },
  ];

  const reconNew = `/reconciliations/new?side=${side}&party=${id}&name=${encodeURIComponent(title)}${branchId != null ? `&branch=${branchId}` : ""}`;
  const payHref = yt
    ? `/payments/yt/new?supplier=${id}&supplierName=${encodeURIComponent(title)}`
    : `/payments/mt/new?customer=${id}&customerName=${encodeURIComponent(title)}`;
  const canPay = can(me.data, "payments.create");
  const pct = row ? usedPct(row) : null;
  const meta = [row?.region, row?.tin ? t("tin", { tin: row.tin }) : null].filter(Boolean).join(" · ");

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4">
      <DocumentHeader
        parent={{ label: td(`side.${side}.title`), href: parentHref }}
        crumb={title}
        title={title}
        status={row ? <DebtStatusBadge row={row} /> : null}
        sub={meta || undefined}
        actions={
          <>
            {toTiyinPositive(advance) ? <AdvanceOffsetButton side={side} branchId={branchId} counterpartyId={id} /> : null}
            {can(me.data, "recon.create") ? (
              <Button variant="secondary" icon={FileCheck2} onClick={() => router.push(reconNew)}>
                {t("mkRecon")}
              </Button>
            ) : null}
            {canPay ? (
              <Button icon={yt ? ArrowUpRight : ArrowDownLeft} onClick={() => router.push(payHref)}>
                {yt ? t("payYt") : t("payMt")}
              </Button>
            ) : null}
          </>
        }
      />
      <div className="grid grid-cols-1 gap-4 min-[1100px]:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Tabs
            aria-label={t("tabs")}
            value={tab}
            onChange={(k) => setTab(k as CardTab)}
            items={[
              { key: "open", label: t("tOpen"), count: open.length },
              { key: "moves", label: t("tMoves") },
              ...(canRecon ? [{ key: "recons", label: t("tRecons"), count: myRecons.length }] : []),
            ]}
          />
          {tab === "open" ? (
            <Table
              caption={t("tOpen")}
              columns={docCols}
              rows={open}
              rowKey={(d) => `${d.branchId}:${d.docType}:${d.docId}`}
              loading={docs.isPending}
              totals={
                open.length
                  ? {
                      docNumber: t("total", { n: open.length }),
                      total: formatMoney(sums.total),
                      returned: formatMoney(sums.returned),
                      paid: formatMoney(sums.paid),
                      open: formatMoney(sums.open),
                    }
                  : undefined
              }
              emptyState={
                <EmptyState
                  icon={CircleCheck}
                  title={t("noOpenT")}
                  description={toTiyinPositive(advance) ? t("noOpenAdv", { s: formatMoney(advance) }) : t("noOpenD")}
                />
              }
            />
          ) : null}
          {tab === "moves" ? <ActSection side={side} counterpartyId={id} branchId={branchId} /> : null}
          {tab === "recons" ? (
            <Table
              caption={t("tRecons")}
              columns={reconCols}
              rows={myRecons}
              rowKey={(r) => String(r.id)}
              loading={recons.isPending}
              onRowClick={(r) => router.push(`/reconciliations/${r.id}`)}
              emptyState={
                <EmptyState
                  icon={FileCheck2}
                  title={t("noReconT")}
                  description={t("noReconD")}
                  action={
                    can(me.data, "recon.create") ? (
                      <Button variant="secondary" onClick={() => router.push(reconNew)}>
                        {t("mkRecon")}
                      </Button>
                    ) : undefined
                  }
                />
              }
            />
          ) : null}
        </div>
        <aside className="grid grid-cols-1 content-start gap-3 max-md:grid-cols-2 md:max-[1099px]:grid-cols-5" aria-label={t("summary")}>
          <Kpi label={yt ? t("kOur") : t("kDebt")} value={formatMoney(debt)} />
          <Kpi
            label={t("kOverdue")}
            value={formatMoney(overdue)}
            tone={toTiyinPositive(overdue) ? "danger" : undefined}
            note={toTiyinPositive(overdue) && row ? t("oldest", { n: row.maxOverdueDays }) : t("noOverdue")}
          />
          {!yt && row?.creditLimit ? (
            <Kpi
              label={t("kLimit")}
              value={formatMoney(row.creditLimit)}
              tone={limitLeft(row).over ? "warning" : undefined}
              note={
                limitLeft(row).over
                  ? t("overBy", { s: formatMoney(limitLeft(row).value) })
                  : t("limitLeft", { s: formatMoney(limitLeft(row).value) })
              }
            />
          ) : null}
          <Kpi label={t("kAdv")} value={formatMoney(advance)} tone={toTiyinPositive(advance) ? "info" : undefined} />
          <Kpi
            label={t("kTerms")}
            value={row?.paymentDays != null ? t("termsV", { n: row.paymentDays }) : "—"}
            note={row?.lastPayment ? t("lastPay", { d: formatIsoDate(row.lastPayment) }) : t("noPay")}
          />
          {!yt && row?.creditLimit && pct !== null ? (
            <div className="col-span-2 rounded-card border border-border bg-surface p-4 md:col-span-5 min-[1100px]:col-span-1">
              <div className="flex items-center justify-between gap-2 text-[13px]">
                <span className="text-text-secondary">{t("limitUse", { p: String(pct).replace(".", ",") })}</span>
                <span className={cn("tabular-nums", pct > 100 && "text-danger")}>
                  {`${formatMoney(debt)} / ${formatMoney(row.creditLimit)}`}
                </span>
              </div>
              <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-border">
                <span
                  className={cn("block h-full rounded-full", pct > 100 ? "bg-danger" : pct > 80 ? "bg-warning" : "bg-primary")}
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </span>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

const toTiyinPositive = (s: string) => !s.startsWith("-") && s !== "0.00" && s !== "0";

const KPI_TONE = { danger: "text-danger", warning: "text-warning", info: "text-info" } as const;

function Kpi(props: { label: string; value: string; note?: string; tone?: keyof typeof KPI_TONE }) {
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <div className="text-[13px] text-text-secondary">{props.label}</div>
      <div className={cn("mt-1 text-[20px] font-semibold leading-7 tabular-nums", props.tone && KPI_TONE[props.tone])}>{props.value}</div>
      {props.note ? <div className="mt-1 text-caption text-text-secondary">{props.note}</div> : null}
    </div>
  );
}
