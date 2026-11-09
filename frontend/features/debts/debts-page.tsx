"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { AlarmClock, HandCoins } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Drawer } from "@/components/ui/drawer";
import { EmptyState, ErrorState, ForbiddenState, NoResultsState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { TextField } from "@/components/ui/text-field";
import { Checkbox } from "@/components/ui/selection-controls";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { formatIsoDate } from "@/features/counterparties/api";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { formatMoney } from "@/lib/format";
import { useBranchStore } from "@/lib/stores/branch";
import { ActSection } from "./act-section";
import { AdvanceOffsetButton } from "./advance-offset";
import { HubTabs } from "@/components/shell/hub-tabs";

export type DebtRow = components["schemas"]["DebtRow"];
export type DebtDoc = components["schemas"]["DebtDoc"];
type Side = "CUSTOMER" | "SUPPLIER";

const CONFIG = {
  CUSTOMER: { permission: "cdebt.view", path: "customers" },
  SUPPLIER: { permission: "sdebt.view", path: "suppliers" },
} as const;

const money = (v: string) =>
  v === "0.00" ? <span className="text-text-secondary">—</span> : <span className="tabular-nums">{formatMoney(v)}</span>;

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
  const [open, setOpen] = useState<DebtRow | null>(null);
  const rows = useMemo(
    () => (report.data?.rows ?? []).filter((r) => matchesDebt(r, q) && (!overdueOnly || r.buckets.overdue !== "0.00")),
    [report.data, q, overdueOnly],
  );

  if (me.data && !allowed) return <ForbiddenState description={t("forbidden", { title })} />;

  const columns: TableColumn<DebtRow>[] = [
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
  const tot = report.data?.totals;

  return (
    <>
      {side === "SUPPLIER" ? <HubTabs hub="supplierDebts" /> : null}
      <h1 className="mb-4 text-page-title">{title}</h1>
      {report.error ? (
        <ErrorState onRetry={() => report.refetch()} />
      ) : (
        <Table
          caption={title}
          columns={columns}
          rows={rows}
          rowKey={(r) => String(r.counterpartyId)}
          loading={!ready || report.isPending}
          onRowClick={setOpen}
          totals={
            tot
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
              <Checkbox label={t("overdueOnly")} checked={overdueOnly} onChange={setOverdueOnly} />
            </div>
          }
          emptyState={
            q || overdueOnly ? (
              <NoResultsState
                onClearFilters={() => {
                  setQ("");
                  setOverdueOnly(false);
                }}
              />
            ) : (
              <EmptyState icon={HandCoins} title={t("empty.title")} description={t(`side.${side}.empty`)} />
            )
          }
        />
      )}
      {open ? <DocsDrawer side={side} row={open} branchId={branchId} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

function DocsDrawer(props: { side: Side; row: DebtRow; branchId: number | null; onClose: () => void }) {
  const t = useTranslations("debts");
  const [tab, setTab] = useState("docs");
  const docs = useQuery({
    queryKey: ["debts", CONFIG[props.side].path, "docs", props.row.counterpartyId, props.branchId],
    queryFn: () =>
      props.side === "CUSTOMER"
        ? unwrap(
            api.GET("/api/debts/customers/{id}/docs", {
              params: { path: { id: props.row.counterpartyId }, query: { branchId: props.branchId ?? undefined } },
            }),
          )
        : unwrap(
            api.GET("/api/debts/suppliers/{id}/docs", {
              params: { path: { id: props.row.counterpartyId }, query: { branchId: props.branchId ?? undefined } },
            }),
          ),
  });
  const columns: TableColumn<DebtDoc>[] = [
    { key: "docNumber", title: t("col.document"), mono: true },
    { key: "date", title: t("col.date"), render: (d) => formatIsoDate(d.date) },
    { key: "dueDate", title: t("col.dueDate"), render: (d) => formatIsoDate(d.dueDate) },
    ...(props.branchId == null ? [{ key: "branch", title: t("col.branch") }] : []),
    {
      key: "open",
      title: t("col.open"),
      align: "right",
      render: (d) =>
        d.open.startsWith("-") ? (
          <span className="tabular-nums">{t("advanceAmount", { amount: formatMoney(d.open.slice(1)) })}</span>
        ) : (
          money(d.open)
        ),
    },
    {
      key: "overdueDays",
      title: t("col.overdue"),
      render: (d) =>
        d.overdueDays > 0 ? (
          <Badge tone={d.overdueDays > 30 ? "danger" : "warning"} icon={AlarmClock}>
            {t("days", { count: d.overdueDays })}
          </Badge>
        ) : null,
    },
  ];
  return (
    <Drawer
      open
      onClose={props.onClose}
      size="lg"
      kind={t(`side.${props.side}.party`)}
      title={props.row.name}
      subtitle={t("tin", { tin: props.row.tin })}
      actions={<AdvanceOffsetButton side={props.side} branchId={props.branchId} counterpartyId={props.row.counterpartyId} />}
    >
      <dl className="mb-4 grid grid-cols-3 gap-4">
        <div>
          <dt className="text-caption text-text-secondary">{t("col.debt")}</dt>
          <dd className="font-mono tabular-nums">
            {formatMoney(props.row.buckets.debt)} {t("currency")}
          </dd>
        </div>
        <div>
          <dt className="text-caption text-text-secondary">{t("overdueSum")}</dt>
          <dd className="font-mono tabular-nums text-danger">
            {formatMoney(props.row.buckets.overdue)} {t("currency")}
          </dd>
        </div>
        <div>
          <dt className="text-caption text-text-secondary">{t("col.advance")}</dt>
          <dd className="font-mono tabular-nums">
            {formatMoney(props.row.buckets.advance)} {t("currency")}
          </dd>
        </div>
      </dl>
      <Tabs
        aria-label={t("drawer.tabs")}
        value={tab}
        onChange={setTab}
        items={[
          { key: "docs", label: t("drawer.openDocs") },
          { key: "act", label: t("drawer.act") },
        ]}
      />
      <div className="mt-4">
        {tab === "act" ? (
          <ActSection side={props.side} counterpartyId={props.row.counterpartyId} branchId={props.branchId} />
        ) : (
          <>
            {docs.error ? (
              <ErrorState onRetry={() => docs.refetch()} />
            ) : (
              <Table
                caption={t("drawer.openDocs")}
                density="compact"
                columns={columns}
                rows={docs.data ?? []}
                rowKey={(d) => `${d.branchId}:${d.docType}:${d.docId}`}
                loading={docs.isPending}
                emptyState={<EmptyState icon={HandCoins} title={t("drawer.emptyTitle")} description={t("drawer.emptyDescription")} />}
              />
            )}
          </>
        )}
      </div>
    </Drawer>
  );
}
