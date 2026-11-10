"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { AlarmClock, ArrowDownLeft, Building2, FileCheck2, HandCoins, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MultiFilter } from "@/components/ui/multi-filter";
import { EmptyState, ErrorState, ForbiddenState, NoResultsState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { TextField } from "@/components/ui/text-field";
import { Checkbox } from "@/components/ui/selection-controls";
import { can, canAny } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { formatIsoDate, todayTashkent } from "@/features/counterparties/api";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { formatMoney, formatQuantity } from "@/lib/format";
import { useBranchStore } from "@/lib/stores/branch";
import { HubTabs } from "@/components/shell/hub-tabs";
import { DebtStatusBadge, ReceivablesSummary, UsedBar } from "./receivables";
import { AGE_KEYS, DEBT_TABS, inAges, inTab, statusOf, sumOf, type AgeKey, type DebtStatus, type DebtTab } from "./receivables-model";

export type DebtRow = components["schemas"]["DebtRow"];
export type DebtDoc = components["schemas"]["DebtDoc"];
type Side = "CUSTOMER" | "SUPPLIER";

const CONFIG = {
  CUSTOMER: { permission: "cdebt.view", path: "customers" },
  SUPPLIER: { permission: "sdebt.view", path: "suppliers" },
} as const;

const money = (v: string) =>
  v === "0.00" ? <span className="text-text-secondary">—</span> : <span className="tabular-nums">{formatMoney(v)}</span>;
const dangerMoney = (v: string) =>
  v === "0.00" ? (
    <span className="text-text-secondary">—</span>
  ) : (
    <span className="font-semibold tabular-nums text-danger">{formatMoney(v)}</span>
  );

/** Lotin/kirill farqsiz oddiy qidiruv: nom yoki STIR. */
export function matchesDebt(row: { name: string; tin: string }, q: string) {
  const t = q.trim().toLowerCase();
  return !t || row.name.toLowerCase().includes(t) || row.tin.includes(t);
}

/** Pul → Mijozlar qarzi / YB qarzi (SPEC 5.5): qarz jurnalidan, muddat guruhlari 1–30 / 31–60 / 61–90 / 90+. */
export function DebtsPage({ side }: { side: Side }) {
  const t = useTranslations("debts");
  const cfg = CONFIG[side];
  const title = t(`side.${side}.title`);
  const me = useMe();
  const selectedBranch = useBranchStore((s) => s.branchId);
  const allowed = can(me.data, cfg.permission);
  const branchId = me.data?.allBranches ? (selectedBranch ?? null) : (me.data?.branchId ?? null);
  const ready = allowed && me.data != null && (me.data.allBranches || branchId != null);
  const report = useQuery({
    queryKey: ["debts", cfg.path, branchId],
    queryFn: () =>
      side === "CUSTOMER"
        ? unwrap(api.GET("/api/debts/customers", { params: { query: { branchId: branchId ?? undefined } } }))
        : unwrap(api.GET("/api/debts/suppliers", { params: { query: { branchId: branchId ?? undefined } } })),
    enabled: ready,
  });
  const [q, setQ] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const router = useRouter();
  const isCustomer = side === "CUSTOMER";
  const [tab, setTab] = useState<DebtTab>("all");
  const [ages, setAges] = useState<AgeKey[]>([]);
  const [statuses, setStatuses] = useState<DebtStatus[]>([]);
  const [regions, setRegions] = useState<string[]>([]);
  const [operators, setOperators] = useState<string[]>([]);
  const all = useMemo(() => report.data?.rows ?? [], [report.data]);
  const rows = useMemo(
    () =>
      all.filter(
        (r) =>
          matchesDebt(r, q) &&
          (isCustomer
            ? inTab(r, tab) &&
              inAges(r, ages) &&
              (statuses.length === 0 || statuses.includes(statusOf(r))) &&
              (regions.length === 0 || regions.includes(r.region ?? "")) &&
              (operators.length === 0 || (r.operator ?? "").split(", ").some((o) => operators.includes(o)))
            : !overdueOnly || r.buckets.overdue !== "0.00"),
      ),
    [all, q, overdueOnly, isCustomer, tab, ages, statuses, regions, operators],
  );
  const filtered = isCustomer
    ? q !== "" || tab !== "all" || ages.length > 0 || statuses.length > 0 || regions.length > 0 || operators.length > 0
    : q !== "" || overdueOnly;
  const clearFilters = () => {
    setQ("");
    setOverdueOnly(false);
    setTab("all");
    setAges([]);
    setStatuses([]);
    setRegions([]);
    setOperators([]);
  };
  const tr = useTranslations("debts.recv");
  // Hudud / Operator chiplari (prototip Receivables): qiymatlar hisobotdagi qatorlardan, «Koʻrsatilmagan» — boʻsh
  const valuesOf = (pick: (r: DebtRow) => string[]) => {
    const counts = new Map<string, number>();
    for (const r of all) for (const v of pick(r)) counts.set(v, (counts.get(v) ?? 0) + 1);
    return [...counts.entries()]
      .sort((a, b) => (a[0] === "" ? 1 : b[0] === "" ? -1 : a[0].localeCompare(b[0])))
      .map(([value, count]) => ({ value, label: value || tr("noValue"), count }));
  };
  const regionOptions = valuesOf((r) => [r.region ?? ""]);
  const operatorOptions = valuesOf((r) => (r.operator ? r.operator.split(", ") : [""]));

  if (me.data && !allowed) return <ForbiddenState description={t("forbidden", { title })} />;

  const supplierColumns: TableColumn<DebtRow>[] = [
    {
      key: "name",
      title: t(`side.${side}.party`),
      render: (r) => (
        <div className="min-w-0">
          <div>{r.name}</div>
          <div className="font-mono text-caption text-text-secondary">{r.tin}</div>
        </div>
      ),
    },
    { key: "debt", title: t("col.debt"), align: "right", render: (r) => money(r.buckets.debt) },
    { key: "notDue", title: t("col.notDue"), align: "right", render: (r) => money(r.buckets.notDue) },
    { key: "d1to30", title: "1–30", align: "right", render: (r) => money(r.buckets.d1to30) },
    { key: "d31to60", title: "31–60", align: "right", render: (r) => money(r.buckets.d31to60) },
    { key: "d61to90", title: "61–90", align: "right", render: (r) => money(r.buckets.d61to90) },
    {
      key: "d90plus",
      title: "90+",
      align: "right",
      render: (r) => (r.buckets.d90plus === "0.00" ? money("0.00") : <span className="text-danger">{money(r.buckets.d90plus)}</span>),
    },
    { key: "advance", title: t("col.advance"), align: "right", render: (r) => money(r.buckets.advance) },
    {
      key: "maxOverdueDays",
      title: t("col.overdue"),
      render: (r) =>
        r.maxOverdueDays > 0 ? (
          <Badge tone={r.maxOverdueDays > 30 ? "danger" : "warning"} icon={AlarmClock}>
            {t("days", { count: r.maxOverdueDays })}
          </Badge>
        ) : null,
    },
    ...(side === "CUSTOMER"
      ? [
          {
            key: "creditLimit",
            title: t("col.limit"),
            align: "right" as const,
            render: (r: DebtRow) => (r.creditLimit ? money(r.creditLimit) : ""),
          },
        ]
      : []),
    { key: "lastPayment", title: t("col.lastPayment"), render: (r) => formatIsoDate(r.lastPayment) },
  ];
  const customerColumns: TableColumn<DebtRow>[] = [
    {
      key: "name",
      title: t("side.CUSTOMER.party"),
      wrap: true,
      render: (r) => (
        <div className="min-w-0">
          <div className="font-medium">{r.name}</div>
          <div className="text-caption text-text-secondary">
            {t("tin", { tin: "" }).trim()} <span className="font-mono">{r.tin}</span>
            {r.region ? ` · ${r.region}` : ""}
            {r.operator ? ` · ${r.operator}` : ""}
          </div>
        </div>
      ),
    },
    { key: "debt", title: t("col.debt"), align: "right", render: (r) => <span className="font-semibold">{money(r.buckets.debt)}</span> },
    { key: "overdue", title: tr("col.overdue"), align: "right", render: (r) => dangerMoney(r.buckets.overdue) },
    {
      key: "oldest",
      title: tr("col.oldest"),
      align: "right",
      render: (r) =>
        r.maxOverdueDays > 0 ? (
          <span className={r.maxOverdueDays > 90 ? "font-semibold text-danger" : "font-semibold text-warning"}>
            {t("days", { count: r.maxOverdueDays })}
          </span>
        ) : (
          <span className="text-text-secondary">—</span>
        ),
    },
    { key: "d1to30", title: tr("age.d1to30"), align: "right", render: (r) => dangerMoney(r.buckets.d1to30) },
    { key: "d31to60", title: tr("age.d31to60"), align: "right", render: (r) => dangerMoney(r.buckets.d31to60) },
    { key: "d61to90", title: tr("age.d61to90"), align: "right", render: (r) => dangerMoney(r.buckets.d61to90) },
    { key: "d90plus", title: tr("age.d90plus"), align: "right", render: (r) => dangerMoney(r.buckets.d90plus) },
    {
      key: "creditLimit",
      title: t("col.limit"),
      align: "right",
      render: (r) => (r.creditLimit ? money(r.creditLimit) : <span className="text-text-secondary">—</span>),
    },
    { key: "used", title: tr("col.used"), render: (r) => <UsedBar row={r} /> },
    {
      key: "lastPayment",
      title: t("col.lastPayment"),
      align: "right",
      render: (r) => (r.lastPayment ? formatIsoDate(r.lastPayment) : <span className="text-text-secondary">—</span>),
    },
    { key: "status", title: tr("col.status"), render: (r) => <DebtStatusBadge row={r} /> },
  ];
  const columns = isCustomer ? customerColumns : supplierColumns;
  const tot = report.data?.totals;

  return (
    <>
      {side === "SUPPLIER" ? <HubTabs hub="supplierDebts" /> : null}
      {isCustomer ? (
        <div className="mb-4 flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-1">
              <h1 className="flex items-baseline gap-2 text-page-title">
                {title}
                {report.data ? <span className="tabular text-body text-text-secondary">{formatQuantity(all.length)}</span> : null}
              </h1>
              <p className="text-table text-text-secondary">{tr("asOf", { d: formatIsoDate(todayTashkent()) })}</p>
            </div>
            {can(me.data, "payments.create") ? (
              <Button icon={Plus} onClick={() => router.push("/payments/mt/new")}>
                {tr("payIn")}
              </Button>
            ) : null}
          </div>
          {report.data ? (
            <ReceivablesSummary
              rows={all}
              ages={ages}
              onAges={(a) => {
                setAges(a);
                setTab("all");
              }}
              onAll={clearFilters}
              allActive={tab === "all" && ages.length === 0 && statuses.length === 0}
            />
          ) : null}
          {report.data && report.data.groupDebt !== "0.00" ? (
            <div className="-mt-1 flex items-center gap-2 rounded-control border border-border bg-background px-3 py-2 text-[13px] text-text-secondary">
              <Building2 size={14} strokeWidth={1.5} aria-hidden />
              <span>{tr("groupNote", { s: formatMoney(report.data.groupDebt) })}</span>
              {canAny(me.data, ["transfer.view", "transfer.fs"]) ? (
                <Link href="/branch-sales" className="ml-auto text-primary hover:underline">
                  {tr("groupOpen")}
                </Link>
              ) : null}
            </div>
          ) : null}
          <Tabs
            aria-label={tr("tabsLabel")}
            value={tab}
            onChange={(k) => setTab(k as DebtTab)}
            items={DEBT_TABS.map((k) => ({ key: k, label: tr(`tab.${k}`), count: all.filter((r) => inTab(r, k)).length }))}
          />
        </div>
      ) : (
        <h1 className="mb-4 text-page-title">{title}</h1>
      )}
      {report.error ? (
        <ErrorState onRetry={() => report.refetch()} />
      ) : (
        <Table
          caption={title}
          columns={columns}
          rows={rows}
          rowKey={(r) => String(r.counterpartyId)}
          loading={!ready || report.isPending}
          onRowClick={(r) => router.push(`/debts/${cfg.path}/${r.counterpartyId}?name=${encodeURIComponent(r.name)}`)}
          rowActions={
            isCustomer
              ? (r) => (
                  <div className="flex items-center gap-3">
                    {can(me.data, "payments.create") ? (
                      <Link
                        href={`/payments/mt/new?customer=${r.counterpartyId}&customerName=${encodeURIComponent(r.name)}`}
                        className="inline-flex items-center gap-1 text-table text-primary hover:underline"
                      >
                        <ArrowDownLeft size={14} strokeWidth={1.5} aria-hidden />
                        {tr("payIn")}
                      </Link>
                    ) : null}
                    {can(me.data, "recon.create") ? (
                      <Link
                        href={`/reconciliations/new?side=CUSTOMER&party=${r.counterpartyId}&name=${encodeURIComponent(r.name)}${branchId != null ? `&branch=${branchId}` : ""}`}
                        className="inline-flex items-center gap-1 text-table text-primary hover:underline"
                      >
                        <FileCheck2 size={14} strokeWidth={1.5} aria-hidden />
                        {tr("recon")}
                      </Link>
                    ) : null}
                  </div>
                )
              : undefined
          }
          totals={
            isCustomer && rows.length > 0
              ? {
                  name: tr("totalN", { n: rows.length }),
                  debt: money(sumOf(rows, (r) => r.buckets.debt)),
                  overdue: dangerMoney(sumOf(rows, (r) => r.buckets.overdue)),
                  d1to30: dangerMoney(sumOf(rows, (r) => r.buckets.d1to30)),
                  d31to60: dangerMoney(sumOf(rows, (r) => r.buckets.d31to60)),
                  d61to90: dangerMoney(sumOf(rows, (r) => r.buckets.d61to90)),
                  d90plus: dangerMoney(sumOf(rows, (r) => r.buckets.d90plus)),
                }
              : !isCustomer && tot
                ? {
                    name: t("total"),
                    debt: money(tot.debt),
                    notDue: money(tot.notDue),
                    d1to30: money(tot.d1to30),
                    d31to60: money(tot.d31to60),
                    d61to90: money(tot.d61to90),
                    d90plus: money(tot.d90plus),
                    advance: money(tot.advance),
                  }
                : undefined
          }
          toolbar={
            <div className="flex flex-wrap items-center gap-4">
              <div className="w-72">
                <TextField label={t("search")} variant="search" size="sm" value={q} onChange={setQ} placeholder={t("searchPlaceholder")} />
              </div>
              {isCustomer ? (
                <>
                  <MultiFilter label={tr("regionFilter")} options={regionOptions} selected={regions} onChange={setRegions} />
                  <MultiFilter label={tr("operatorFilter")} options={operatorOptions} selected={operators} onChange={setOperators} />
                  <MultiFilter
                    label={tr("statusFilter")}
                    options={(["ok", "overdue", "limit", "adv"] as const).map((v) => ({
                      value: v,
                      label: tr(`status.${v}`),
                      count: all.filter((r) => statusOf(r) === v).length,
                    }))}
                    selected={statuses}
                    onChange={setStatuses}
                  />
                  <MultiFilter
                    label={tr("ageFilter")}
                    options={AGE_KEYS.map((v) => ({
                      value: v,
                      label: tr(`age.${v}`),
                      count: all.filter((r) => r.buckets[v] !== "0.00").length,
                    }))}
                    selected={ages}
                    onChange={setAges}
                  />
                  {filtered ? (
                    <Button variant="tertiary" size="sm" onClick={clearFilters}>
                      {tr("clearFilters")}
                    </Button>
                  ) : null}
                </>
              ) : (
                <Checkbox label={t("overdueOnly")} checked={overdueOnly} onChange={setOverdueOnly} />
              )}
            </div>
          }
          emptyState={
            filtered ? (
              <NoResultsState onClearFilters={clearFilters} />
            ) : (
              <EmptyState icon={HandCoins} title={t("empty.title")} description={t(`side.${side}.empty`)} />
            )
          }
        />
      )}
    </>
  );
}
