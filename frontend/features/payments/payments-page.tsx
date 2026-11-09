"use client";

import { ArrowDownLeft, ArrowUpRight, Ban, CircleCheck, CircleX, Clock, FilePen, Plus, Truck, Wallet, type LucideIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateChip, MultiFilter } from "@/components/ui/multi-filter";
import type { PageSize } from "@/components/ui/pagination";
import { RowMenu } from "@/components/ui/row-menu";
import { EmptyState, ErrorState, ForbiddenState, NoResultsState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { TextField } from "@/components/ui/text-field";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { formatIsoDate } from "@/features/counterparties/api";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { cn } from "@/lib/cn";
import { formatMoney, formatQuantity } from "@/lib/format";
import { useBranchStore } from "@/lib/stores/branch";
import { PAYMENT_MT, PAYMENT_YT, type PaymentStatus } from "./api";
import {
  ACCOUNT_KINDS,
  EMPTY_FILTERS,
  PAY_PAGE_SIZES,
  PAY_STATUSES,
  PAY_VIEWS,
  advanceOf,
  facet,
  filterRows,
  filtersFromParams,
  hasFilters,
  kpis as kpisOf,
  totals as totalsOf,
  viewCounts,
  type PayFilters,
  type PayStatus,
} from "./overview-model";

type Row = components["schemas"]["PaymentOverviewRow"];

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const t = useTranslations("payments");
  const map = {
    DRAFT: { tone: "neutral", icon: FilePen },
    POSTED: { tone: "success", icon: CircleCheck },
    CANCELLED: { tone: "neutral", icon: Ban },
  } as const;
  return (
    <Badge tone={map[status].tone} icon={map[status].icon}>
      {t(`status.${status}`)}
    </Badge>
  );
}

const STATUS_LOOK: Record<PayStatus, { tone: Tone; icon: LucideIcon }> = {
  DRAFT: { tone: "neutral", icon: FilePen },
  PENDING: { tone: "warning", icon: Clock },
  POSTED: { tone: "success", icon: CircleCheck },
  CANCELLED: { tone: "neutral", icon: CircleX },
};

function usePaymentOverview(branchId: number | null, enabled: boolean) {
  return useQuery({
    queryKey: ["payments", "overview", branchId],
    queryFn: () => unwrap(api.GET("/api/payments/overview", { params: { query: { branchId: branchId ?? undefined } } })),
    enabled,
  });
}

/** Bosiladigan karta (prototip `Payments` KPI): ikonka, nom, qiymat, izoh; faol boʻlsa — chegarasi asosiy rangda. */
function KpiTile(props: {
  icon: LucideIcon;
  tone: "success" | "neutral" | "warning";
  label: string;
  value: string;
  note: string;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = props.icon;
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-pressed={props.active}
      className={cn(
        "flex min-w-0 flex-col items-start gap-1.5 rounded-card border bg-surface px-4 py-3.5 text-left shadow-sm transition-colors hover:border-text-secondary",
        props.active ? "border-primary" : "border-border",
      )}
    >
      <span className="flex items-center gap-2 text-caption font-medium text-text-secondary">
        <span
          className={cn(
            "flex size-6 flex-none items-center justify-center rounded-md",
            props.tone === "success" && "bg-success-bg text-success",
            props.tone === "warning" && "bg-warning-bg text-warning",
            props.tone === "neutral" && "bg-table-header text-text-secondary",
          )}
        >
          <Icon size={14} strokeWidth={1.5} aria-hidden />
        </span>
        {props.label}
      </span>
      <span className="tabular max-w-full truncate text-kpi">{props.value}</span>
      <span className="max-w-full truncate text-caption text-text-secondary">{props.note}</span>
    </button>
  );
}

/**
 * Pul → Toʻlovlar (prototip `Payments`, SPEC 5.5): MT (mijozdan kirim) va YT (yetkazib beruvchiga chiqim) bitta jadvalda —
 * 4 karta (bugun kirim / chiqim, tasdiqlashda, qoralamalar), koʻrinishlar soni bilan, qidiruv + Kontragent / Usul / Kassa-hisob /
 * Holat / Yaratgan / Sana, ustunlar (Raqam, Sana, Turi, Kontragent, Usul, Kassa / hisob, Summa, Taqsimlangan, Avans, Holat,
 * Yaratgan), pastda filtrdagi tasdiqlanganlar jami (kirim, chiqim, sof), 25/50/100.
 */
export function PaymentsPage() {
  const t = useTranslations("payments.list");
  const tp = useTranslations("payments");
  const me = useMe();
  const params = useSearchParams();
  const selectedBranch = useBranchStore((s) => s.branchId);
  const allowed = can(me.data, "payments.view");
  const canMt = can(me.data, PAYMENT_MT);
  const canYt = can(me.data, PAYMENT_YT);
  const scopeBranch = me.data?.allBranches ? (selectedBranch ?? null) : null;
  const workBranch = me.data?.allBranches ? (selectedBranch ?? null) : (me.data?.branchId ?? null);
  const list = usePaymentOverview(scopeBranch, allowed);
  const [f, setF] = useState<PayFilters>(() => filtersFromParams((k) => params.get(k)));
  const [search, setSearch] = useState(f.q);

  // Hujjat — toʻliq sahifa: /payments/mt|yt/new, /payments/mt|yt/<id>. Eski oʻtishlar yoʻnaltiriladi:
  // ?open=<MT id> — buyurtma kartochkasidan; ?tab=yt&new=1&supplier=&supplierName=&amount= — kirim kartochkasidan «Toʻlash»
  const router = useRouter();
  const setEditor = (e: { kind: "MT" | "YT"; id: number | null }) =>
    router.push(`/payments/${e.kind.toLowerCase()}/${e.id === null ? "new" : e.id}`);
  const openParam = params.get("open");
  const newParam = params.get("new");
  useEffect(() => {
    const id = Number(openParam);
    if (Number.isInteger(id) && id > 0) router.replace(`/payments/mt/${id}`);
    else if (newParam === "1" && Number(params.get("supplier")) > 0) {
      const qs = new URLSearchParams();
      for (const k of ["supplier", "supplierName", "amount"]) qs.set(k, params.get(k) ?? "");
      router.replace(`/payments/yt/new?${qs.toString()}`);
    }
  }, [openParam, newParam, params, router]);

  const all = useMemo(() => list.data?.rows ?? [], [list.data]);
  const rows = useMemo(() => filterRows(all, f), [all, f]);
  const counts = useMemo(() => viewCounts(all), [all]);
  const today = list.data?.today ?? "";
  const k = useMemo(() => kpisOf(all, today), [all, today]);
  const tot = useMemo(() => totalsOf(rows), [rows]);

  if (me.data && !allowed) return <ForbiddenState description={tp("forbidden")} />;

  const apply = (patch: Partial<PayFilters>) => setF((cur) => ({ ...cur, page: 1, ...patch }));
  const clearAll = () => {
    setSearch("");
    setF({ ...EMPTY_FILTERS, size: f.size });
  };
  const preset = (patch: Partial<PayFilters>) => {
    setSearch("");
    setF({ ...EMPTY_FILTERS, size: f.size, ...patch });
  };
  const todayOnly = f.from === today && (!f.to || f.to === today);
  const onlyStatus = (s: PayStatus) => f.statuses.length === 1 && f.statuses[0] === s;

  const pages = Math.max(1, Math.ceil(rows.length / f.size));
  const page = Math.min(f.page, pages);
  const shown = rows.slice((page - 1) * f.size, page * f.size);
  const dead = (r: Row) => r.status === "CANCELLED";
  const muted = (r: Row) => (dead(r) ? "text-text-disabled" : undefined);
  const open = (r: Row) => setEditor({ kind: r.kind, id: r.id });

  const columns: TableColumn<Row>[] = [
    { key: "number", title: t("c.number"), mono: true, render: (r) => <span className={muted(r)}>{r.number}</span> },
    { key: "date", title: t("c.date"), render: (r) => <span className={muted(r)}>{formatIsoDate(r.paymentDate)}</span> },
    {
      key: "type",
      title: t("c.type"),
      render: (r) => {
        const Icon = r.kind === "YT" ? ArrowUpRight : ArrowDownLeft;
        return (
          <span className={cn("inline-flex items-center gap-1.5", muted(r))}>
            <Icon size={16} strokeWidth={1.5} aria-hidden />
            {r.kind === "YT" ? t("out") : t("in")}
          </span>
        );
      },
    },
    {
      key: "party",
      title: t("c.party"),
      wrap: true,
      render: (r) => (
        <span className={cn("flex min-w-0 flex-col", muted(r))}>
          <span className="truncate font-medium">{r.party}</span>
          <span className="flex items-center gap-1.5 truncate text-caption text-text-secondary">
            {r.kind === "YT" ? (r.partySub ? t("stir", { tin: r.partySub }) : "") : (r.partySub ?? "")}
            {r.source === "DRIVER" ? (
              <Badge tone="info" icon={Truck}>
                {t("driver")}
              </Badge>
            ) : null}
          </span>
        </span>
      ),
    },
    {
      key: "method",
      title: t("c.method"),
      render: (r) => (
        <span className={muted(r) ?? "text-text-secondary"}>{t(`method.${r.accountKind as "CASH" | "BANK" | "TERMINAL"}`)}</span>
      ),
    },
    { key: "account", title: t("c.account"), render: (r) => <span className={muted(r)}>{r.account}</span> },
    {
      key: "amount",
      title: t("c.amount"),
      align: "right",
      render: (r) => (
        <span className={cn("tabular font-semibold", muted(r))}>{formatMoney(r.kind === "YT" ? `-${r.amount}` : r.amount)}</span>
      ),
    },
    {
      key: "allocated",
      title: t("c.allocated"),
      align: "right",
      render: (r) => (
        <span className={cn("tabular", muted(r) ?? "text-text-secondary")}>{r.allocated ? formatMoney(r.allocated) : "—"}</span>
      ),
    },
    {
      key: "advance",
      title: t("c.advance"),
      align: "right",
      render: (r) => {
        const adv = advanceOf(r);
        return <span className={cn("tabular", adv ? "text-warning" : "text-text-disabled")}>{adv ? formatMoney(adv) : "—"}</span>;
      },
    },
    {
      key: "status",
      title: t("c.status"),
      render: (r) => (
        <Badge tone={STATUS_LOOK[r.status].tone} icon={STATUS_LOOK[r.status].icon}>
          {t(`st.${r.status}`)}
        </Badge>
      ),
    },
    { key: "by", title: t("c.by"), render: (r) => <span className="text-text-secondary">{r.createdBy}</span> },
  ];

  const newButton = (kind: "MT" | "YT", primary: boolean) =>
    (kind === "MT" ? canMt : canYt) ? (
      <Button
        key={kind}
        icon={kind === "MT" ? Plus : ArrowUpRight}
        variant={primary ? "primary" : "secondary"}
        disabled={workBranch == null}
        title={workBranch == null ? tp("selectBranchFirst") : undefined}
        onClick={() => setEditor({ kind, id: null })}
      >
        {kind === "MT" ? t("newMt") : t("newYt")}
      </Button>
    ) : null;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-baseline gap-2 text-page-title">
          {t("title")}
          {list.data ? <span className="tabular text-text-secondary">{formatQuantity(all.length)}</span> : null}
        </h1>
        <div className="flex items-center gap-2">
          {newButton("YT", false)}
          {newButton("MT", true)}
        </div>
      </div>
      {list.data ? (
        <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <KpiTile
            icon={ArrowDownLeft}
            tone="success"
            label={t("kIn")}
            value={formatMoney(k.inToday.sum)}
            note={t("kDocs", { n: formatQuantity(k.inToday.count) })}
            active={f.view === "in" && todayOnly}
            onClick={() => preset({ view: "in", statuses: ["POSTED"], from: today, to: today })}
          />
          <KpiTile
            icon={ArrowUpRight}
            tone="neutral"
            label={t("kOut")}
            value={formatMoney(k.outToday.sum)}
            note={t("kDocs", { n: formatQuantity(k.outToday.count) })}
            active={f.view === "out" && todayOnly}
            onClick={() => preset({ view: "out", statuses: ["POSTED"], from: today, to: today })}
          />
          <KpiTile
            icon={Clock}
            tone="warning"
            label={t("kPending")}
            value={t("kN", { n: formatQuantity(k.pending.count) })}
            note={formatMoney(k.pending.sum)}
            active={f.view === "pending"}
            onClick={() => preset({ view: "pending" })}
          />
          <KpiTile
            icon={FilePen}
            tone="neutral"
            label={t("kDrafts")}
            value={t("kN", { n: formatQuantity(k.drafts.count) })}
            note={formatMoney(k.drafts.sum)}
            active={f.view === "all" && onlyStatus("DRAFT")}
            onClick={() => preset({ statuses: ["DRAFT"] })}
          />
        </div>
      ) : null}
      <div className="mb-3">
        <Tabs
          aria-label={t("views.label")}
          value={f.view}
          onChange={(v) => apply({ view: v as PayFilters["view"] })}
          items={PAY_VIEWS.map((v) => ({ key: v, label: t(`views.${v}`), count: list.data ? counts[v] : undefined }))}
        />
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="w-80">
          <TextField
            label={t("search")}
            variant="search"
            size="sm"
            value={search}
            onChange={(v) => {
              setSearch(v);
              apply({ q: v });
            }}
            placeholder={t("searchPlaceholder")}
            className="[&>label]:sr-only"
          />
        </div>
        <MultiFilter
          label={t("f.party")}
          searchable
          options={facet(
            all,
            (r) => r.party,
            (r) => r.party,
          )}
          selected={f.parties}
          onChange={(v) => apply({ parties: v })}
        />
        <MultiFilter
          label={t("f.method")}
          options={ACCOUNT_KINDS.map((m) => ({ value: m, label: t(`method.${m}`), count: all.filter((r) => r.accountKind === m).length }))}
          selected={f.methods}
          onChange={(v) => apply({ methods: v })}
        />
        <MultiFilter
          label={t("f.account")}
          options={facet(
            all,
            (r) => r.accountId,
            (r) => r.account,
          )}
          selected={f.accounts}
          onChange={(v) => apply({ accounts: v })}
        />
        <MultiFilter
          label={t("f.status")}
          options={PAY_STATUSES.map((s) => ({ value: s, label: t(`st.${s}`), count: all.filter((r) => r.status === s).length }))}
          selected={f.statuses}
          onChange={(v) => apply({ statuses: v })}
        />
        <MultiFilter
          label={t("f.by")}
          searchable
          options={facet(
            all,
            (r) => r.createdBy,
            (r) => r.createdBy,
          )}
          selected={f.by}
          onChange={(v) => apply({ by: v })}
        />
        <DateChip label={t("f.date")} from={f.from} to={f.to} invalid={t("dateInvalid")} onChange={(from, to) => apply({ from, to })} />
        {hasFilters(f) ? (
          <button
            type="button"
            onClick={clearAll}
            className="h-control-sm px-1.5 text-[13px] font-medium text-primary-button hover:underline"
          >
            {t("clearF")}
          </button>
        ) : null}
      </div>
      {list.error ? (
        <ErrorState onRetry={() => list.refetch()} />
      ) : (
        <>
          <Table
            caption={t("caption")}
            columns={columns}
            rows={shown}
            rowKey={(r) => `${r.kind}-${r.id}`}
            loading={list.isPending}
            onRowClick={open}
            rowActions={(r) => (
              <RowMenu
                items={[
                  {
                    key: "open",
                    label: t("open"),
                    icon: <ArrowUpRight size={16} strokeWidth={1.5} aria-hidden />,
                    onSelect: () => open(r),
                  },
                ]}
              />
            )}
            emptyState={
              all.length > 0 ? (
                <NoResultsState onClearFilters={clearAll} />
              ) : (
                <EmptyState icon={Wallet} title={t("emptyT")} description={t("emptyD")} action={newButton("MT", true) ?? undefined} />
              )
            }
            pagination={
              rows.length > PAY_PAGE_SIZES[0]
                ? {
                    page,
                    pageSize: f.size as PageSize,
                    total: rows.length,
                    onPageChange: (p) => setF((cur) => ({ ...cur, page: p })),
                    onPageSizeChange: (size) => apply({ size }),
                    pageSizeOptions: [...PAY_PAGE_SIZES],
                  }
                : undefined
            }
          />
          {rows.length > 0 ? (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-card border border-border bg-table-header px-5 py-2.5">
              <span className="text-caption text-text-secondary">{t("totNote")}</span>
              <span className="flex flex-wrap items-baseline gap-x-6 gap-y-2 text-[13px]">
                <span className="flex gap-1.5 whitespace-nowrap">
                  <span className="text-text-secondary">{t("totIn")}:</span>
                  <span className="tabular font-medium">{formatMoney(tot.in)}</span>
                </span>
                <span className="flex gap-1.5 whitespace-nowrap">
                  <span className="text-text-secondary">{t("totOut")}:</span>
                  <span className="tabular font-medium">{formatMoney(tot.out)}</span>
                </span>
                <span className="flex items-baseline gap-2 whitespace-nowrap border-l border-border pl-5">
                  <span className="text-text-secondary">{t("totNet")}:</span>
                  <span className="tabular text-base font-semibold">{formatMoney(tot.net)}</span>
                </span>
              </span>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
