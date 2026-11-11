"use client";

import {
  ArrowUpRight,
  Ban,
  CircleCheck,
  CirclePause,
  Clock,
  FileSpreadsheet,
  FilterX,
  GitBranchPlus,
  Lock,
  Plus,
  ShieldCheck,
  ShieldMinus,
  ShieldX,
  SlidersHorizontal,
  Truck,
  Upload,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ColumnsMenu, useColumnPrefs } from "@/components/ui/columns-menu";
import { DateChip, MultiFilter, type FilterOption } from "@/components/ui/multi-filter";
import type { PageSize } from "@/components/ui/pagination";
import { RowMenu, type RowMenuItem } from "@/components/ui/row-menu";
import { EmptyState, ErrorState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { useMe } from "@/features/auth/session";
import { DeactivateDialog } from "@/features/organization/deactivate-dialog";
import { cn } from "@/lib/cn";
import { formatMoney, formatQuantity } from "@/lib/format";
import { useBranchStore } from "@/lib/stores/branch";
import {
  canBlockCard,
  canEditCard,
  formatIsoDate,
  useActivateCounterparty,
  useBlockCounterparty,
  useCounterpartyOverview,
  type CounterpartyRole,
  type OverviewRow,
} from "./api";
import {
  EMPTY_FILTERS,
  VIEWS_C,
  VIEWS_S,
  activeFilterCount,
  agingTest,
  applyFilters,
  cents,
  facet,
  licenseOf,
  overLimit,
  search,
  sortRows,
  viewCount,
  type AgingKey,
  type DateKind,
  type LicenseState,
  type OverviewFilters,
  type OverviewKind,
  type OverviewStatus,
  type SortKey,
  type View,
} from "./overview-model";

const C_COLS = ["name", "tin", "kind", "region", "branches", "lic", "debt", "overdue", "limit", "price", "lastSale", "status"] as const;
const S_COLS = ["name", "tin", "lic", "branches", "ourDebt", "terms", "buyer", "lastIn", "status"] as const;
type Col = (typeof C_COLS)[number] | (typeof S_COLS)[number];

const WIDTH: Record<Col, number> = {
  name: 260,
  tin: 116,
  kind: 112,
  region: 120,
  branches: 130,
  lic: 170,
  debt: 150,
  overdue: 160,
  limit: 140,
  price: 150,
  lastSale: 190,
  status: 120,
  ourDebt: 150,
  terms: 120,
  buyer: 160,
  lastIn: 190,
};
const RIGHT: Col[] = ["debt", "overdue", "limit", "ourDebt", "terms"];
const SORT_OF: Partial<Record<Col, SortKey>> = {
  name: "name",
  debt: "debt",
  ourDebt: "debt",
  overdue: "overdue",
  limit: "limit",
  price: "price",
  lastSale: "lastSale",
  lastIn: "lastIn",
  terms: "terms",
};
const STATUS: Record<OverviewStatus, [Tone, LucideIcon]> = {
  ACTIVE: ["success", CircleCheck],
  BLOCKED: ["danger", Ban],
  INACTIVE: ["neutral", CirclePause],
};
const LIC: Record<LicenseState, [Tone, LucideIcon]> = {
  ok: ["success", ShieldCheck],
  soon: ["warning", Clock],
  expired: ["danger", ShieldX],
  none: ["neutral", ShieldMinus],
};
const KINDS: OverviewKind[] = ["PHARMACY", "CLINIC", "HOSPITAL", "DISTRIBUTOR", "MAKER"];
const AGING_KEYS: AgingKey[] = ["has", "1-30", "31-60", "61-90", "90plus", "none"];
const LIC_KEYS: LicenseState[] = ["ok", "soon", "expired", "none"];
const STATUSES: OverviewStatus[] = ["ACTIVE", "BLOCKED", "INACTIVE"];
const PAGE_SIZES: PageSize[] = [25, 50, 100];

const Dash = () => <span className="text-text-disabled">—</span>;

/** Bugungi sana (Toshkent) — server qaytargan `today` boʻlmasa. */
const todayIso = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(new Date());

function Highlight({ text, q }: { text: string; q: string }) {
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-sm bg-warning-bg px-0.5 text-text-primary">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

export function OverviewPage({ role }: { role: CounterpartyRole }) {
  const t = useTranslations("counterparties.overview");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const customers = role === "CUSTOMER";
  const me = useMe();
  const perms = me.data?.permissions;
  const canEdit = canEditCard(perms, customers, !customers);
  const canBlock = canBlockCard(perms, customers, !customers);
  const selectedBranch = useBranchStore((s) => s.branchId);
  const branchId = me.data?.allBranches ? (selectedBranch ?? null) : null;
  const myBranch = me.data?.allBranches ? null : me.data?.branchId;
  const list = useCounterpartyOverview(role, branchId);
  const block = useBlockCounterparty();
  const activate = useActivateCounterparty();
  const colKeys = (customers ? C_COLS : S_COLS) as readonly Col[];
  const { cols, update: setCols, reset: resetCols } = useColumnPrefs(`medix-kt-${role}-cols`, [...colKeys]);
  const views = (customers ? VIEWS_C : VIEWS_S) as readonly View[];
  const initialView = (views as readonly string[]).includes(params.get("view") ?? "") ? (params.get("view") as View) : "all";
  const [f, setF] = useState<OverviewFilters>({
    ...EMPTY_FILTERS,
    view: initialView,
    lic: params.get("lic") ? [params.get("lic") as LicenseState] : [],
  });
  const [more, setMore] = useState(false);
  const [sort, setSort] = useState<{ key: Col; dir: "asc" | "desc" } | null>(null);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState<PageSize>(25);
  const [selected, setSelected] = useState<string[]>([]);
  const [dialog, setDialog] = useState<{ kind: "block" | "inactive"; rows: OverviewRow[] } | null>(null);

  const data = list.data;
  const today = data?.today ?? todayIso();
  const all = useMemo(() => data?.items ?? [], [data]);
  const set = (patch: Partial<OverviewFilters>) => {
    setF((p) => ({ ...p, ...patch }));
    setPage(1);
    setSelected([]);
  };
  const setView = (v: View) => {
    set({ view: v });
    const qs = new URLSearchParams(params.toString());
    if (v === "all") qs.delete("view");
    else qs.set("view", v);
    router.replace(qs.size ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const filtered = useMemo(() => applyFilters(all, f, today, customers) as OverviewRow[], [all, f, today, customers]);
  const sorted = useMemo(() => sortRows(filtered, sort ? (SORT_OF[sort.key] ?? null) : null, sort?.dir === "desc"), [filtered, sort]);
  const pages = Math.max(1, Math.ceil(sorted.length / size));
  const cur = Math.min(page, pages);
  const slice = sorted.slice((cur - 1) * size, cur * size);
  const q = f.q.trim();

  const count = (rows: OverviewRow[], test: (r: OverviewRow) => boolean) => rows.filter(test).length;
  const opts = <V extends string>(values: V[], label: (v: V) => string, test: (r: OverviewRow, v: V) => boolean): FilterOption<V>[] =>
    values.map((v) => ({ value: v, label: label(v), count: count(all, (r) => test(r, v)) }));
  const facetOpts = (pick: (r: OverviewRow) => (string | null | undefined)[]): FilterOption<string>[] =>
    facet(all, (r) => pick(r as OverviewRow)).map((x) => ({ value: x.value, label: x.value, count: x.count }));
  const branchName = (code: string) => data?.branches.find((b) => b.code === code)?.name ?? code;
  const activeNames = [
    q ? `${t("searchWord")} «${q}»` : "",
    f.status.length ? t("f.status") : "",
    f.debt.length ? t("f.debt") : "",
    f.branches.length ? t("f.branch") : "",
    f.operators.length ? t("f.operator") : "",
    f.buyers.length ? t("f.buyer") : "",
    f.regions.length ? t("f.region") : "",
    f.kinds.length ? t("f.kind") : "",
    f.lic.length ? t("f.lic") : "",
    f.priceTypes.length ? t("f.price") : "",
    f.overLimit ? t("f.limit") : "",
    f.ctrl ? t("f.ctrl") : "",
    f.from ? t("f.period") : "",
  ].filter(Boolean);
  const hasFilters = activeFilterCount(f) > 0 || Boolean(q);
  const clearAll = () => set({ ...EMPTY_FILTERS, view: f.view });

  const labels = Object.fromEntries(
    colKeys.map((k) => [k, k === "debt" && !branchId && !myBranch ? t("col.debtAll") : t(`col.${k}`)]),
  ) as Record<Col, string>;

  const licChips = (r: OverviewRow) => {
    const l = licenseOf(r.licenseValidUntil, today);
    const [tone, icon] = LIC[l.state];
    return (
      <span className="flex items-center gap-1">
        <span title={`${t("licTip")}${r.licenseValidUntil ? ` · ${formatIsoDate(r.licenseValidUntil)}` : ""}`}>
          <Badge tone={tone} icon={icon}>
            {t(`ls.${l.state}`, { n: l.days })}
          </Badge>
        </span>
        {r.controlledAllowed ? (
          <span
            title={t("ctrlTip")}
            aria-label={t("ctrlTip")}
            className="inline-flex h-6 items-center rounded-control bg-danger-bg px-1.5 text-danger"
          >
            <Lock size={14} strokeWidth={1.5} aria-hidden />
          </span>
        ) : null}
      </span>
    );
  };
  const brChips = (r: OverviewRow) => (
    <span className="flex gap-1 whitespace-nowrap">
      {r.branches.map((b) => (
        <span
          key={b}
          title={branchName(b)}
          className="rounded-control bg-background px-1.5 py-0.5 font-mono text-caption font-medium text-text-secondary"
        >
          {b}
        </span>
      ))}
    </span>
  );
  const money = (v: string | null | undefined, r: OverviewRow) => (r.inScope && v ? formatMoney(v) : <Dash />);

  const cell = (r: OverviewRow, k: Col) => {
    const grey = !r.inScope;
    switch (k) {
      case "name": {
        const hit = q ? search(r, q) : null;
        const dual = r.customer && r.supplier;
        const sub = !r.inScope
          ? t("otherBr")
          : hit && hit.where !== "name"
            ? `${t(`match.${hit.where}`)}: ${
                hit.where === "tin"
                  ? r.tin
                  : hit.where === "phone"
                    ? (r.phone ?? "")
                    : hit.where === "contact"
                      ? (r.contactPerson ?? "")
                      : hit.where === "legal"
                        ? (r.legalName ?? "")
                        : hit.where === "doc"
                          ? (r.lastSaleNumber ?? r.lastReceiptNumber ?? "")
                          : [...r.operators, ...r.buyers].join(", ")
              }`
            : (r.legalName ?? "");
        return (
          <span className="flex max-w-[236px] min-w-0 flex-col">
            <span className="flex min-w-0 items-center gap-2">
              <span className={cn("truncate font-medium", grey && "text-text-secondary")}>
                <Highlight text={r.name} q={hit?.where === "name" ? q : ""} />
              </span>
              {dual ? <Badge tone="info">{customers ? t("roleS") : t("roleC")}</Badge> : null}
            </span>
            {sub ? (
              <span className="truncate text-caption text-text-secondary" title={grey ? t("otherBrTip") : undefined}>
                {sub}
              </span>
            ) : null}
          </span>
        );
      }
      case "tin":
        return <span className={grey ? "text-text-secondary" : ""}>{r.tin.replace(/^(\d{3})(\d{3})(\d{3})$/, "$1 $2 $3")}</span>;
      case "kind":
        return r.kind ? <span className="text-text-secondary">{t(`kind.${r.kind}`)}</span> : <Dash />;
      case "region":
        return r.region ? <span className="text-text-secondary">{r.region}</span> : <Dash />;
      case "branches":
        return r.branches.length ? brChips(r) : <Dash />;
      case "lic":
        return licChips(r);
      case "debt":
      case "ourDebt": {
        if (!r.inScope) return <Dash />;
        const d = cents(r.debt);
        const tone = cents(r.overdue) > 0n ? "text-danger" : overLimit(r) ? "text-warning" : "";
        return <span className={cn("font-semibold tabular-nums", d > 0n ? tone : "text-text-secondary")}>{formatMoney(r.debt)}</span>;
      }
      case "overdue":
        return cents(r.overdue) > 0n ? (
          <span className="flex flex-col items-end">
            <span className="font-semibold text-danger tabular-nums">{formatMoney(r.overdue)}</span>
            <span className="text-caption text-danger">{t("late", { n: r.maxOverdueDays })}</span>
          </span>
        ) : (
          <Dash />
        );
      case "limit":
        return <span className="text-text-secondary tabular-nums">{money(r.creditLimit, r)}</span>;
      case "price":
        return r.priceTypes.length ? <span className="text-text-secondary">{r.priceTypes.join(", ")}</span> : <Dash />;
      case "lastSale":
        return r.lastSaleDate && r.lastSaleOrderId ? (
          <Link href={`/orders/${r.lastSaleOrderId}`} onClick={(e) => e.stopPropagation()} className="text-primary-button hover:underline">
            {formatIsoDate(r.lastSaleDate)} · {r.lastSaleNumber}
          </Link>
        ) : (
          <Dash />
        );
      case "lastIn":
        return r.lastReceiptDate && r.lastReceiptId ? (
          <Link href={`/receipts/${r.lastReceiptId}`} onClick={(e) => e.stopPropagation()} className="text-primary-button hover:underline">
            {formatIsoDate(r.lastReceiptDate)} · {r.lastReceiptNumber}
          </Link>
        ) : (
          <Dash />
        );
      case "terms":
        return r.paymentDays.length ? (
          <span className="text-text-secondary">{r.paymentDays.map((n) => t("daysN", { n })).join(" / ")}</span>
        ) : (
          <Dash />
        );
      case "buyer":
        return r.buyers.length ? <span className="text-text-secondary">{r.buyers.join(", ")}</span> : <Dash />;
      case "status": {
        const [tone, icon] = STATUS[r.status];
        return (
          <Badge tone={grey ? "neutral" : tone} icon={icon}>
            {t(`st.${r.status}`)}
          </Badge>
        );
      }
    }
  };

  const columns: TableColumn<OverviewRow>[] = cols
    .filter((c) => c.visible)
    .map((c) => {
      const k = c.key as Col;
      return {
        key: k,
        title: labels[k],
        width: WIDTH[k],
        align: RIGHT.includes(k) ? "right" : "left",
        mono: k === "tin",
        sortable: Boolean(SORT_OF[k]),
        pinned: k === "name",
        render: (r: OverviewRow) => cell(r, k),
      };
    });

  const rowItems = (r: OverviewRow): RowMenuItem[] => [
    {
      key: "open",
      label: t("aOpen"),
      icon: <ArrowUpRight size={16} strokeWidth={1.5} aria-hidden />,
      onSelect: () => router.push(`${pathname}/${r.id}`),
    },
    ...(canEdit
      ? [
          {
            key: "terms",
            label: t("aTerms"),
            icon: <GitBranchPlus size={16} strokeWidth={1.5} aria-hidden />,
            onSelect: () => router.push(`${pathname}/${r.id}?tab=terms`),
          },
        ]
      : []),
    ...(canBlock
      ? [
          r.status === "BLOCKED"
            ? {
                key: "unblock",
                label: t("aActivate"),
                icon: <CircleCheck size={16} strokeWidth={1.5} aria-hidden />,
                onSelect: () =>
                  block.mutate(
                    { id: r.id, reason: null },
                    { onSuccess: () => toast({ tone: "success", title: t("tActivated", { name: r.name }) }) },
                  ),
              }
            : {
                key: "block",
                label: t("aBlock"),
                icon: <Ban size={16} strokeWidth={1.5} className="text-danger" aria-hidden />,
                onSelect: () => setDialog({ kind: "block", rows: [r] }),
              },
        ]
      : []),
  ];

  const selRows = all.filter((r) => selected.includes(String(r.id)));
  const exportHref = (ids: number[] = []) =>
    `/api/counterparties/export?${new URLSearchParams([
      ["role", role],
      ["status", "ALL"],
      ...ids.map((id) => ["ids", String(id)]),
    ]).toString()}`;

  const runBulk = async (kind: "block" | "inactive", rows: OverviewRow[], reason: string) => {
    for (const r of rows) {
      if (kind === "block") await block.mutateAsync({ id: r.id, reason });
      else await activate.mutateAsync({ id: r.id, reason });
    }
    toast({ tone: "success", title: t(kind === "block" ? "tBlocked" : "tInact", { count: formatQuantity(rows.length) }) });
    setDialog(null);
    setSelected([]);
  };

  const dateKinds: DateKind[] = ["last", "pay", "created"];
  const viewCounts = Object.fromEntries(views.map((v) => [v, viewCount(all, v, today)])) as Record<View, number>;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="flex items-baseline gap-2 text-page-title">
          {customers ? t("titleC") : t("titleS")}
          {data ? <span className="text-body font-normal text-text-secondary tabular-nums">{formatQuantity(all.length)}</span> : null}
        </h1>
        <div className="flex items-center gap-2">
          {canEdit ? (
            <Button variant="secondary" icon={Upload} onClick={() => router.push(`${pathname}/import`)}>
              {t("import")}
            </Button>
          ) : null}
          <Button variant="secondary" icon={FileSpreadsheet} onClick={() => window.location.assign(exportHref())}>
            {t("export")}
          </Button>
          {canEdit ? (
            <Button icon={Plus} onClick={() => router.push(`${pathname}/new`)}>
              {customers ? t("addC") : t("addS")}
            </Button>
          ) : null}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <Tabs
          aria-label={t("viewsLabel")}
          items={views.map((v) => ({ key: v, label: t(`views.${v}`), count: data ? viewCounts[v] : undefined }))}
          value={f.view}
          onChange={(k) => setView(k as View)}
        />
        <div className="w-80">
          <TextField
            label={t("search")}
            variant="search"
            size="sm"
            value={f.q}
            onChange={(v) => set({ q: v })}
            placeholder={customers ? t("searchC") : t("searchS")}
            className="[&>label]:sr-only"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MultiFilter
            label={t("f.status")}
            options={opts(
              STATUSES,
              (s) => t(`st.${s}`),
              (r, s) => r.status === s,
            )}
            selected={f.status}
            onChange={(v) => set({ status: v })}
          />
          <MultiFilter
            label={t("f.debt")}
            options={opts(
              AGING_KEYS,
              (k) => t(`aging.${k}`),
              (r, k) => agingTest[k](r),
            )}
            selected={f.debt}
            onChange={(v) => set({ debt: v })}
          />
          <MultiFilter
            label={t("f.branch")}
            options={(data?.branches ?? []).map((b) => ({
              value: b.code,
              label: b.name,
              count: count(all, (r) => r.branches.includes(b.code)),
            }))}
            selected={f.branches}
            onChange={(v) => set({ branches: v })}
          />
          {customers ? (
            <MultiFilter
              label={t("f.operator")}
              searchable
              options={facetOpts((r) => r.operators)}
              selected={f.operators}
              onChange={(v) => set({ operators: v })}
            />
          ) : (
            <MultiFilter
              label={t("f.buyer")}
              searchable
              options={facetOpts((r) => r.buyers)}
              selected={f.buyers}
              onChange={(v) => set({ buyers: v })}
            />
          )}
          <div
            role="radiogroup"
            aria-label={t("f.period")}
            className="flex h-control-sm items-center rounded-control border border-border bg-surface p-0.5"
          >
            {dateKinds.map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={f.dateKind === k}
                onClick={() => set({ dateKind: k })}
                className={cn(
                  "h-full rounded-[6px] px-2.5 text-[13px] font-medium",
                  f.dateKind === k ? "bg-background text-text-primary shadow-sm" : "text-text-secondary hover:text-text-primary",
                )}
              >
                {k === "last" && !customers ? t("dk.lastIn") : t(`dk.${k}`)}
              </button>
            ))}
          </div>
          <DateChip label={t("f.period")} from={f.from} to={f.to} invalid={t("f.dateInvalid")} onChange={(from, to) => set({ from, to })} />
          <Button variant="secondary" size="sm" icon={SlidersHorizontal} onClick={() => setMore((m) => !m)} aria-expanded={more}>
            {t("f.more")}
          </Button>
          {hasFilters ? (
            <button
              type="button"
              onClick={clearAll}
              className="h-control-sm px-1.5 text-[13px] font-medium text-primary-button hover:underline"
            >
              {t("f.reset")}
            </button>
          ) : null}
          <div className="ml-auto">
            <ColumnsMenu
              label={t("columns")}
              hint={t("colsHint")}
              resetLabel={t("colsReset")}
              columns={cols}
              labels={labels}
              onChange={setCols}
              onReset={resetCols}
            />
          </div>
        </div>
        {more ? (
          <div className="flex flex-wrap items-center gap-2">
            <MultiFilter
              label={t("f.region")}
              searchable
              options={facetOpts((r) => [r.region])}
              selected={f.regions}
              onChange={(v) => set({ regions: v })}
            />
            <MultiFilter
              label={t("f.kind")}
              options={opts(
                KINDS.filter((k) => all.some((r) => r.kind === k)),
                (k) => t(`kind.${k}`),
                (r, k) => r.kind === k,
              )}
              selected={f.kinds}
              onChange={(v) => set({ kinds: v })}
            />
            <MultiFilter
              label={t("f.lic")}
              options={opts(
                LIC_KEYS,
                (k) => (k === "soon" ? t("ls.soonAny") : t(`ls.${k}`)),
                (r, k) => licenseOf(r.licenseValidUntil, today).state === k,
              )}
              selected={f.lic}
              onChange={(v) => set({ lic: v })}
            />
            {customers ? (
              <>
                <MultiFilter
                  label={t("f.price")}
                  options={facetOpts((r) => r.priceTypes)}
                  selected={f.priceTypes}
                  onChange={(v) => set({ priceTypes: v })}
                />
                <MultiFilter
                  label={t("f.limit")}
                  options={[{ value: "y", label: t("f.limitY"), count: count(all, overLimit) }]}
                  selected={f.overLimit ? ["y"] : []}
                  onChange={(v) => set({ overLimit: v.length > 0 })}
                />
              </>
            ) : null}
            <MultiFilter
              label={t("f.ctrl")}
              options={[{ value: "y", label: t("f.ctrlY"), count: count(all, (r) => r.controlledAllowed) }]}
              selected={f.ctrl ? ["y"] : []}
              onChange={(v) => set({ ctrl: v.length > 0 })}
            />
          </div>
        ) : null}
      </div>
      {list.error ? (
        <ErrorState onRetry={() => list.refetch()} />
      ) : (
        <Table
          caption={customers ? t("titleC") : t("titleS")}
          columns={columns}
          rows={slice}
          rowKey={(r) => String(r.id)}
          loading={list.isPending}
          activeKey={typeof open === "number" ? String(open) : undefined}
          onRowClick={(r) => router.push(`${pathname}/${r.id}`)}
          rowActions={(r) => <RowMenu label={t("actions")} items={rowItems(r)} />}
          selectable
          selectedKeys={selected}
          onSelectionChange={setSelected}
          bulkActions={
            <div className="flex items-center gap-2">
              <span className="font-medium">{t("selected", { count: formatQuantity(selected.length) })}</span>
              {canBlock ? (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Ban}
                  onClick={() => setDialog({ kind: "block", rows: selRows.filter((r) => r.status !== "BLOCKED") })}
                >
                  {t("aBlock")}
                </Button>
              ) : null}
              {canEdit ? (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={CirclePause}
                  onClick={() => setDialog({ kind: "inactive", rows: selRows.filter((r) => r.status !== "INACTIVE") })}
                >
                  {t("aInactive")}
                </Button>
              ) : null}
              <Button
                variant="secondary"
                size="sm"
                icon={FileSpreadsheet}
                onClick={() => window.location.assign(exportHref(selRows.map((r) => r.id)))}
              >
                {t("export")}
              </Button>
              <Button variant="tertiary" size="sm" onClick={() => setSelected([])}>
                {t("clearSel")}
              </Button>
            </div>
          }
          sort={sort ? { key: sort.key, dir: sort.dir } : { key: "name", dir: "asc" }}
          onSortChange={(s) => setSort({ key: s.key as Col, dir: s.dir })}
          emptyState={
            hasFilters || f.view !== "all" ? (
              <EmptyState
                icon={FilterX}
                title={t("noResTitle")}
                description={t("noResD", { filters: activeNames.join(", ") || t(`views.${f.view}`) })}
                action={
                  <Button variant="secondary" icon={FilterX} onClick={() => (clearAll(), setView("all"))}>
                    {t("f.reset")}
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={customers ? Users : Truck}
                title={customers ? t("emptyC") : t("emptyS")}
                description={t("emptyD")}
                action={
                  canEdit ? (
                    <Button icon={Plus} onClick={() => router.push(`${pathname}/new`)}>
                      {customers ? t("addC") : t("addS")}
                    </Button>
                  ) : undefined
                }
              />
            )
          }
          pagination={
            sorted.length > 0
              ? {
                  page: cur,
                  pageSize: size,
                  total: sorted.length,
                  pageSizeOptions: PAGE_SIZES,
                  onPageChange: setPage,
                  onPageSizeChange: (s) => (setSize(s), setPage(1)),
                }
              : undefined
          }
        />
      )}
      {dialog && dialog.rows.length > 0 ? (
        <DeactivateDialog
          title={
            dialog.rows.length === 1
              ? t(dialog.kind === "block" ? "dBlockT" : "dInactT", { name: dialog.rows[0].name })
              : t(dialog.kind === "block" ? "dBlockN" : "dInactN", { count: formatQuantity(dialog.rows.length) })
          }
          consequence={t(dialog.kind === "block" ? "dBlockC" : "dInactC")}
          actionLabel={t(dialog.kind === "block" ? "dBlockGo" : "dInactGo")}
          pending={block.isPending || activate.isPending}
          error={block.error ?? activate.error}
          onConfirm={(reason) => void runBulk(dialog.kind, dialog.rows, reason)}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </div>
  );
}
