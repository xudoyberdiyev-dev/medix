"use client";

import { useQuery } from "@tanstack/react-query";
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

export type DebtRow = components["schemas"]["DebtRow"];
export type DebtDoc = components["schemas"]["DebtDoc"];
type Side = "CUSTOMER" | "SUPPLIER";

const CONFIG = {
  CUSTOMER: { title: "Mijozlar qarzi", permission: "cdebt.view", path: "customers", party: "Mijoz" },
  SUPPLIER: { title: "Yetkazib beruvchilar qarzi", permission: "sdebt.view", path: "suppliers", party: "Yetkazib beruvchi" },
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
  const cfg = CONFIG[side];
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

  if (me.data && !allowed) return <ForbiddenState description={`«${cfg.title}» sahifasi sizning rolingiz uchun yopiq.`} />;

  const columns: TableColumn<DebtRow>[] = [
    {
      key: "name",
      title: cfg.party,
      render: (r) => (
        <div className="min-w-0">
          <div>{r.name}</div>
          <div className="font-mono text-caption text-text-secondary">{r.tin}</div>
        </div>
      ),
    },
    { key: "debt", title: "Qarz", align: "right", render: (r) => money(r.buckets.debt) },
    { key: "notDue", title: "Muddati kelmagan", align: "right", render: (r) => money(r.buckets.notDue) },
    { key: "d1to30", title: "1–30", align: "right", render: (r) => money(r.buckets.d1to30) },
    { key: "d31to60", title: "31–60", align: "right", render: (r) => money(r.buckets.d31to60) },
    { key: "d61to90", title: "61–90", align: "right", render: (r) => money(r.buckets.d61to90) },
    {
      key: "d90plus",
      title: "90+",
      align: "right",
      render: (r) => (r.buckets.d90plus === "0.00" ? money("0.00") : <span className="text-danger">{money(r.buckets.d90plus)}</span>),
    },
    { key: "advance", title: "Avans", align: "right", render: (r) => money(r.buckets.advance) },
    {
      key: "maxOverdueDays",
      title: "Kechikish",
      render: (r) =>
        r.maxOverdueDays > 0 ? (
          <Badge tone={r.maxOverdueDays > 30 ? "danger" : "warning"} icon={AlarmClock}>
            {r.maxOverdueDays} kun
          </Badge>
        ) : null,
    },
    ...(side === "CUSTOMER"
      ? [
          {
            key: "creditLimit",
            title: "Limit",
            align: "right" as const,
            render: (r: DebtRow) => (r.creditLimit ? money(r.creditLimit) : ""),
          },
        ]
      : []),
    { key: "lastPayment", title: "Oxirgi toʻlov", render: (r) => formatIsoDate(r.lastPayment) },
  ];
  const t = report.data?.totals;

  return (
    <>
      <h1 className="mb-4 text-page-title">{cfg.title}</h1>
      {report.error ? (
        <ErrorState onRetry={() => report.refetch()} />
      ) : (
        <Table
          caption={cfg.title}
          columns={columns}
          rows={rows}
          rowKey={(r) => String(r.counterpartyId)}
          loading={!ready || report.isPending}
          onRowClick={setOpen}
          totals={
            t
              ? {
                  name: "Jami",
                  debt: money(t.debt),
                  notDue: money(t.notDue),
                  d1to30: money(t.d1to30),
                  d31to60: money(t.d31to60),
                  d61to90: money(t.d61to90),
                  d90plus: money(t.d90plus),
                  advance: money(t.advance),
                }
              : undefined
          }
          toolbar={
            <div className="flex flex-wrap items-center gap-4">
              <div className="w-72">
                <TextField label="Qidirish" variant="search" size="sm" value={q} onChange={setQ} placeholder="Nomi yoki STIR" />
              </div>
              <Checkbox label="Faqat muddati oʻtganlar" checked={overdueOnly} onChange={setOverdueOnly} />
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
              <EmptyState
                icon={HandCoins}
                title="Qarz yoʻq"
                description={
                  side === "CUSTOMER"
                    ? "Sotuvdan keyin mijoz qarzi shu yerda koʻrinadi."
                    : "Kirim oʻtkazilgach yetkazib beruvchi qarzi shu yerda koʻrinadi."
                }
              />
            )
          }
        />
      )}
      {open ? <DocsDrawer side={side} row={open} branchId={branchId} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

function DocsDrawer(props: { side: Side; row: DebtRow; branchId: number | null; onClose: () => void }) {
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
    { key: "docNumber", title: "Hujjat", mono: true },
    { key: "date", title: "Sana", render: (d) => formatIsoDate(d.date) },
    { key: "dueDate", title: "Toʻlov kuni", render: (d) => formatIsoDate(d.dueDate) },
    ...(props.branchId == null ? [{ key: "branch", title: "Filial" }] : []),
    {
      key: "open",
      title: "Qoldiq",
      align: "right",
      render: (d) => (d.open.startsWith("-") ? <span className="tabular-nums">avans {formatMoney(d.open.slice(1))}</span> : money(d.open)),
    },
    {
      key: "overdueDays",
      title: "Kechikish",
      render: (d) =>
        d.overdueDays > 0 ? (
          <Badge tone={d.overdueDays > 30 ? "danger" : "warning"} icon={AlarmClock}>
            {d.overdueDays} kun
          </Badge>
        ) : null,
    },
  ];
  return (
    <Drawer
      open
      onClose={props.onClose}
      size="lg"
      kind={CONFIG[props.side].party}
      title={props.row.name}
      subtitle={`STIR ${props.row.tin}`}
      actions={<AdvanceOffsetButton side={props.side} branchId={props.branchId} counterpartyId={props.row.counterpartyId} />}
    >
      <dl className="mb-4 grid grid-cols-3 gap-4">
        <div>
          <dt className="text-caption text-text-secondary">Qarz</dt>
          <dd className="font-mono tabular-nums">{formatMoney(props.row.buckets.debt)} soʻm</dd>
        </div>
        <div>
          <dt className="text-caption text-text-secondary">Muddati oʻtgan</dt>
          <dd className="font-mono tabular-nums text-danger">{formatMoney(props.row.buckets.overdue)} soʻm</dd>
        </div>
        <div>
          <dt className="text-caption text-text-secondary">Avans</dt>
          <dd className="font-mono tabular-nums">{formatMoney(props.row.buckets.advance)} soʻm</dd>
        </div>
      </dl>
      <Tabs
        aria-label="Kontragent boʻlimlari"
        value={tab}
        onChange={setTab}
        items={[
          { key: "docs", label: "Ochiq hujjatlar" },
          { key: "act", label: "Akt sverka" },
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
                caption="Ochiq hujjatlar"
                density="compact"
                columns={columns}
                rows={docs.data ?? []}
                rowKey={(d) => `${d.branchId}:${d.docType}:${d.docId}`}
                loading={docs.isPending}
                emptyState={<EmptyState icon={HandCoins} title="Ochiq hujjat yoʻq" description="Barcha hujjatlar yopilgan." />}
              />
            )}
          </>
        )}
      </div>
    </Drawer>
  );
}
