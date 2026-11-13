"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Ban,
  CircleCheck,
  CircleX,
  ClipboardList,
  Clock,
  Columns3,
  FileDown,
  FilePen,
  ListOrdered,
  PackageCheck,
  PackageX,
  Plus,
  Printer,
  TriangleAlert,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/selection-controls";
import { EmptyState, ErrorState, ForbiddenState, NoResultsState } from "@/components/ui/system-states";
import { FilterChip } from "@/components/ui/filter-chip";
import { Table, type TableColumn } from "@/components/ui/table";
import type { TabItem } from "@/components/ui/tabs";
import { DateChip, MultiFilter } from "@/components/ui/multi-filter";
import { TextField } from "@/components/ui/text-field";
import { Tooltip } from "@/components/ui/tooltip";
import { can, canAny } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import type { components } from "@/lib/api/schema";
import { formatDate, formatMoney, formatQuantity, formatTime } from "@/lib/format";
import { useBranchStore } from "@/lib/stores/branch";
import { useSalesZones } from "@/features/sales-zones/api";
import { useHiddenColumns } from "@/lib/use-hidden-columns";
import { SavedViews } from "@/components/ui/saved-views";
import { ORDER_CREATE, useOrders, type OrderStatus, type OrderSummary } from "./api";
import type { OrdersT } from "./i18n";
import { readOpenDraft } from "./open-draft";
import { shortName, stageHint } from "./stage-hint";
import {
  DELIVERY_TYPES,
  DEFAULT_ORDER_FILTERS,
  PAGE_SIZES,
  PAYMENT_TYPES,
  STATUSES,
  hasOrderFilters,
  ordersExportHref,
  parseOrderFilters,
  serializeOrderFilters,
  type OrderFilters,
  type OrderSort,
} from "./url-state";

const STATUS_STYLE: Record<OrderStatus, { tone: "neutral" | "warning" | "info" | "success" | "danger"; icon: LucideIcon }> = {
  DRAFT: { tone: "neutral", icon: FilePen },
  PENDING_APPROVAL: { tone: "warning", icon: Clock },
  QUEUED: { tone: "info", icon: ListOrdered },
  PICKING: { tone: "info", icon: ClipboardList },
  MARKING: { tone: "info", icon: ClipboardList },
  CHECKING: { tone: "info", icon: PackageCheck },
  DOCUMENTING: { tone: "info", icon: FilePen },
  LOADING: { tone: "info", icon: Truck },
  IN_TRANSIT: { tone: "info", icon: Truck },
  DELIVERED: { tone: "success", icon: CircleCheck },
  UNDELIVERED: { tone: "danger", icon: PackageX },
  REJECTED: { tone: "danger", icon: CircleX },
  CANCELLED: { tone: "neutral", icon: Ban },
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const t = useTranslations("orders");
  const s = STATUS_STYLE[status];
  return (
    <Badge tone={s.tone} icon={s.icon}>
      {t(`status.${status}`)}
    </Badge>
  );
}

export const day = (iso: string) => formatDate(new Date(`${iso}T00:00:00+05:00`));

const ALL = "ALL";
type StatusCount = components["schemas"]["StatusCount"];

/** Holat yorliqlari: «Hammasi» + 13 holat, har birida soni (summasi — tanlangan yorliq ostida). */
export function statusTabs(counts: StatusCount[], t: OrdersT): TabItem[] {
  return counts.map((c) => ({
    key: c.status ?? ALL,
    label: c.status ? t(`status.${c.status}`) : t("list.all"),
    count: c.count,
  }));
}

export function tabSummary(counts: StatusCount[], status: string | null, t: OrdersT): string {
  const c = counts.find((x) => (x.status ?? null) === status) ?? counts[0];
  if (!c) return "";
  return t("list.summary", {
    label: c.status ? t(`status.${c.status}`) : t("list.all"),
    count: formatQuantity(c.count),
    amount: formatMoney(c.total),
  });
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** ?soldFrom=YYYY-MM-DD&soldTo=YYYY-MM-DD — shu davrda sotilgan yoki qaytarilgan buyurtmalar (hisobot bilan bir xil). */
export function soldParam(params: Pick<URLSearchParams, "get">): { from: string | null; to: string | null } | null {
  const from = params.get("soldFrom");
  const to = params.get("soldTo");
  const f = from && ISO_DAY.test(from) ? from : null;
  const t = to && ISO_DAY.test(to) ? to : null;
  return f || t ? { from: f, to: t } : null;
}

export function soldLabel(s: { from: string | null; to: string | null }, t: OrdersT): string {
  if (s.from && s.from === s.to) return t("list.soldOn", { date: day(s.from) });
  if (s.from && s.to) return t("list.soldRange", { from: day(s.from), to: day(s.to) });
  return s.from ? t("list.soldFrom", { date: day(s.from) }) : t("list.soldTo", { date: day(s.to ?? "") });
}

const ALWAYS = ["number", "customer", "status"];

const WARN: readonly string[] = ["PENDING_APPROVAL"];
const BAD: readonly string[] = ["UNDELIVERED", "REJECTED"];
const DEAD: readonly string[] = ["CANCELLED", "REJECTED"];
const HINT_TONE = {
  warning: "text-warning",
  info: "text-info",
  secondary: "text-text-secondary",
  danger: "text-danger",
  success: "text-success",
} as const;

/** ⚠ izohi (prototip Orders: issue): bloklangan · limitdan oshgan · muddati oʻtgan qarz. */
export function creditText(c: components["schemas"]["CreditFlag"], t: OrdersT): string {
  return [
    c.blocked ? t("list.credit.blocked") : null,
    c.overLimit ? t("list.credit.overLimit", { amount: formatMoney(c.overLimit) }) : null,
    c.overdue ? t("list.credit.overdue", { amount: formatMoney(c.overdue), days: c.overdueDays }) : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Holat kartalari (prototip): nomi + soni (nishon) + summasi; «Tasdiqlashda» — sariq, «Yetkazilmadi»/«Rad etildi» — qizil. */
function StatusCards({
  counts,
  value,
  onChange,
  label,
  t,
}: {
  counts: StatusCount[];
  value: string;
  onChange: (k: string) => void;
  label: string;
  t: OrdersT;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex min-w-0 flex-wrap gap-1.5">
      {counts.map((c) => {
        const key = c.status ?? ALL;
        const on = key === value;
        const badge = on
          ? "bg-primary-button text-white"
          : WARN.includes(key) && c.count > 0
            ? "bg-warning-bg text-warning"
            : BAD.includes(key) && c.count > 0
              ? "bg-danger-bg text-danger"
              : "bg-background text-text-secondary";
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(key)}
            className={`flex min-w-[108px] flex-col items-start gap-0.5 rounded-card border px-3 py-[7px] text-left transition-colors hover:border-primary/50 ${
              on
                ? "border-primary-button bg-primary-soft/40 shadow-[inset_0_0_0_1px_var(--color-primary-button)]"
                : "border-border bg-surface"
            }`}
          >
            <span className={`flex items-center gap-1.5 text-[12.5px] leading-4 whitespace-nowrap ${on ? "font-semibold" : "font-medium"}`}>
              {c.status ? t(`status.${c.status}`) : t("list.all")}
              <span className={`h-[18px] min-w-5 rounded-full px-1.5 text-center text-[11.5px] leading-[18px] font-semibold ${badge}`}>
                {formatQuantity(c.count)}
              </span>
            </span>
            <span className="text-caption whitespace-nowrap text-text-secondary tabular-nums">{formatMoney(c.total)}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Sana maydoni (KK.OO.YYYY): toʻgʻri yoki boʻsh boʻlsa — darhol qoʻllanadi. */
/**
 * Buyurtmalar (prototip `Orders`, SPEC 5.2/120): holat kartalari (soni + summasi), filtr chiplari (Mijoz, Holat, Yetkazish usuli,
 * Hudud, Operator, Toʻlov turi, Sana — soni bilan), jadval: raqam, sana/vaqt, mijoz/hudud, yetkazish/sana, toʻlov turi, qatorlar,
 * summa, holat + bosqich izohi, «Hozir kimda», operator; tanlash → terish varagʻi; saralash, «Ustunlar», «Koʻrinishlar», .xlsx; URL'da.
 */
export function OrdersPage() {
  const t = useTranslations("orders");
  const me = useMe();
  const selectedBranch = useBranchStore((s) => s.branchId);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const filters = parseOrderFilters(new URLSearchParams(params.toString()), { customer: t("list.customer"), operator: t("list.operator") });
  const [search, setSearch] = useState(filters.q);
  const [hidden, setHidden] = useHiddenColumns("medix-orders-columns");
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Buyurtma — alohida sahifa (prototip): `/orders/<id>`, `/orders/new`.
  // Eski havolalar: ?open=<id> (bildirishnoma), ?new=1[&customer=<id>&customerName=…] (bosh sahifa) — sahifaga yoʻnaltiriladi.
  // Ochiq hujjat (SPEC 208): boshqa sahifaga oʻtib qaytganda saqlanmagan buyurtma shu holatda ochiladi.
  useEffect(() => {
    const id = Number(params.get("open"));
    if (Number.isInteger(id) && id > 0) return router.replace(`/orders/${id}`);
    if (params.get("new") === "1") {
      const c = Number(params.get("customer"));
      const qs =
        Number.isInteger(c) && c > 0
          ? `?${new URLSearchParams({ customer: String(c), customerName: params.get("customerName") ?? "" })}`
          : "";
      return router.replace(`/orders/new${qs}`);
    }
    const d = readOpenDraft();
    if (d) router.replace(d.id ? `/orders/${d.id}` : "/orders/new");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- faqat birinchi ochilishda
  }, []);
  // Yigʻish taymeri izohi daqiqada yangilanadi
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);
  const openOrder = (id: number | null) => router.push(id === null ? "/orders/new" : `/orders/${id}`);
  const allowed = canAny(me.data, ["orders.view", "approvals.view"]);
  const canCreate = can(me.data, ORDER_CREATE);
  // «N» — yangi buyurtma (prototip: kbd N), matn maydonida emas
  useEffect(() => {
    if (!canCreate) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || (e.key !== "n" && e.key !== "N")) return;
      const el = e.target as HTMLElement | null;
      if (el && (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.isContentEditable)) return;
      e.preventDefault();
      router.push("/orders/new");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canCreate, router]);
  const branchId = me.data?.allBranches ? (selectedBranch ?? null) : null;
  const orders = useOrders(filters, branchId);
  // O6: savdo zonasi filtri — ruxsat boʻlsa (zonalar roʻyxati), filial doirasida
  const zoneList = useSalesZones(branchId, false, canAny(me.data, ["salesZones.view", "salesZones.edit", "orders.view"]));
  const multiZoneBranch = new Set((zoneList.data ?? []).map((z) => z.branchId)).size > 1;

  const apply = (patch: Partial<OrderFilters>) => {
    const next = { ...filters, ...patch, ...("page" in patch ? {} : { page: 1 }) };
    const qs = serializeOrderFilters(next);
    setSelected([]);
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  if (me.data && !allowed) return <ForbiddenState description={t("list.forbidden")} />;

  const muted = (o: OrderSummary) => (DEAD.includes(o.status) ? "text-text-secondary" : "");
  const allColumns: TableColumn<OrderSummary>[] = [
    { key: "number", title: t("list.col.number"), mono: true, sortable: true },
    {
      key: "orderDate",
      title: t("list.col.date"),
      sortable: true,
      render: (o) => (
        <span className={`flex flex-col ${muted(o)}`}>
          <span>{day(o.orderDate)}</span>
          <span className="text-caption text-text-secondary tabular-nums">{formatTime(new Date(o.createdAt))}</span>
        </span>
      ),
    },
    {
      key: "customer",
      title: t("list.col.customer"),
      sortable: true,
      render: (o) => (
        <span className={`flex min-w-0 flex-col ${muted(o)}`}>
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-medium">{o.customer}</span>
            {o.credit ? (
              <Tooltip content={creditText(o.credit, t)}>
                <TriangleAlert size={14} strokeWidth={1.5} className="shrink-0 text-warning" aria-label={creditText(o.credit, t)} />
              </Tooltip>
            ) : null}
          </span>
          {o.region ? <span className="truncate text-caption text-text-secondary">{o.region}</span> : null}
        </span>
      ),
    },
    {
      key: "deliveryType",
      title: t("list.col.delivery"),
      render: (o) => (
        <span className={`flex flex-col ${muted(o)}`}>
          <span>{o.deliveryType === "PICKUP" ? t("list.pickup") : t("list.delivery")}</span>
          {o.deliveryDate ? <span className="text-caption text-text-secondary">{day(o.deliveryDate)}</span> : null}
        </span>
      ),
    },
    {
      key: "paymentType",
      title: t("list.col.paymentType"),
      render: (o) => <span className="text-text-secondary">{t(`paymentType.${o.paymentType}`)}</span>,
    },
    {
      key: "lines",
      title: t("list.col.lines"),
      align: "right",
      render: (o) => <span className={`tabular-nums ${muted(o)}`}>{formatQuantity(o.lines)}</span>,
    },
    {
      key: "total",
      title: t("list.col.total"),
      align: "right",
      sortable: true,
      render: (o) => <span className={`tabular-nums ${muted(o)}`}>{formatMoney(o.total)}</span>,
    },
    {
      key: "status",
      title: t("list.col.status"),
      render: (o) => {
        const h = stageHint(o, now);
        return (
          <span className="flex flex-col items-start gap-0.5">
            <span className="flex items-center gap-2">
              <OrderStatusBadge status={o.status} />
              {o.approvalLevel === "DIRECTOR" && o.status === "PENDING_APPROVAL" ? (
                <Badge tone="warning">{t("list.director")}</Badge>
              ) : null}
            </span>
            {h ? <span className={`text-caption ${HINT_TONE[h.tone]}`}>{t(`list.stage.${h.key}`, h)}</span> : null}
          </span>
        );
      },
    },
    {
      key: "holder",
      title: t("list.col.holder"),
      render: (o) => <span className={o.holder ? "" : "text-text-secondary"}>{o.holder ? shortName(o.holder) : "—"}</span>,
    },
    {
      key: "createdBy",
      title: t("list.col.operator"),
      render: (o) => <span className="text-text-secondary">{shortName(o.createdBy)}</span>,
    },
  ];
  const columns = allColumns.filter((c) => ALWAYS.includes(c.key) || !hidden.includes(c.key));

  const filtered = hasOrderFilters(filters);
  const clearAll = () => (setSearch(""), apply({ ...DEFAULT_ORDER_FILTERS, sort: filters.sort, desc: filters.desc, size: filters.size }));
  const current = orders.data?.statuses.find((x) => (x.status ?? null) === filters.status) ?? orders.data?.statuses[0];
  const soldNow = filters.soldFrom || filters.soldTo ? { from: filters.soldFrom, to: filters.soldTo } : null;
  const facets = orders.data?.facets;
  const allCount = orders.data?.statuses[0];
  const refOptions = (list: { id: number; name: string; count: number }[] | undefined, chosen: { id: number; name: string }[]) => {
    const opts = (list ?? []).map((x) => ({ value: x.id, label: x.name, count: x.count }));
    for (const c of chosen) if (!opts.some((o) => o.value === c.id)) opts.push({ value: c.id, label: c.name, count: 0 });
    return opts;
  };
  const pickRefs = (ids: number[], list: { id: number; name: string }[] | undefined, chosen: { id: number; name: string }[]) =>
    ids.map((id) => ({ id, name: list?.find((x) => x.id === id)?.name ?? chosen.find((x) => x.id === id)?.name ?? `#${id}` }));
  const hasChips =
    filters.customers.length ||
    filters.operators.length ||
    filters.statuses.length ||
    filters.delivery.length ||
    filters.payments.length ||
    filters.regions.length ||
    filters.orderFrom ||
    filters.orderTo ||
    filters.mine ||
    soldNow;
  const rows = orders.data?.items ?? [];
  const printable = rows.filter((o) => selected.includes(String(o.id)) && (o.status === "QUEUED" || o.status === "PICKING"));
  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="flex items-baseline gap-2 text-page-title">
          {t("list.title")}
          {allCount ? (
            <span className="text-body font-normal text-text-secondary tabular-nums">{formatQuantity(allCount.count)}</span>
          ) : null}
        </h1>
        <div className="flex items-center gap-2">
          {orders.data && orders.data.total > 0 ? (
            <a
              href={ordersExportHref(filters, branchId)}
              download
              className="inline-flex h-control-md items-center gap-2 rounded-control border border-border bg-surface px-4 font-medium hover:bg-background"
            >
              <FileDown size={16} strokeWidth={1.5} aria-hidden />
              {t("list.export")}
            </a>
          ) : null}
          {canCreate ? (
            <Button icon={Plus} onClick={() => openOrder(null)}>
              {t("list.create")}
              <kbd className="ml-1 rounded-sm border border-white/40 px-1 text-[11px] leading-4 font-normal">N</kbd>
            </Button>
          ) : null}
        </div>
      </div>
      {orders.data ? (
        <div className="mb-3">
          <StatusCards
            counts={orders.data.statuses}
            value={filters.status ?? ALL}
            onChange={(k) => apply({ status: k === ALL ? null : (k as OrderStatus) })}
            label={t("list.statusTabs")}
            t={t}
          />
        </div>
      ) : null}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="w-72">
          <TextField
            label={t("list.search")}
            variant="search"
            size="sm"
            value={search}
            onChange={(v) => {
              setSearch(v);
              clearTimeout(debounce.current);
              debounce.current = setTimeout(() => apply({ q: v.trim() }), 300);
            }}
            placeholder={t("list.searchPlaceholder")}
            className="[&>label]:sr-only"
          />
        </div>
        <MultiFilter
          label={t("list.f.customer")}
          searchable
          options={refOptions(facets?.customers, filters.customers)}
          selected={filters.customers.map((c) => c.id)}
          onChange={(ids) => apply({ customers: pickRefs(ids, facets?.customers, filters.customers) })}
        />
        <MultiFilter
          label={t("list.f.status")}
          options={STATUSES.map((st) => ({ value: st, label: t(`status.${st}`) }))}
          selected={filters.statuses}
          onChange={(v) => apply({ statuses: v })}
        />
        <MultiFilter
          label={t("list.f.delivery")}
          options={DELIVERY_TYPES.map((d) => ({ value: d, label: d === "PICKUP" ? t("list.pickup") : t("list.delivery") }))}
          selected={filters.delivery}
          onChange={(v) => apply({ delivery: v })}
        />
        <MultiFilter
          label={t("list.f.region")}
          options={(facets?.regions ?? []).map((r) => ({ value: r.id, label: r.name, count: r.count }))}
          selected={filters.regions}
          onChange={(v) => apply({ regions: v })}
        />
        {zoneList.data?.length ? (
          <MultiFilter
            label={t("list.f.zone")}
            searchable
            options={zoneList.data.map((z) => ({ value: z.id, label: multiZoneBranch ? `${z.name} · ${z.branch}` : z.name }))}
            selected={filters.zones}
            onChange={(v) => apply({ zones: v })}
          />
        ) : null}
        <MultiFilter
          label={t("list.f.operator")}
          options={refOptions(facets?.operators, filters.operators)}
          selected={filters.operators.map((o) => o.id)}
          onChange={(ids) => apply({ operators: pickRefs(ids, facets?.operators, filters.operators) })}
        />
        <MultiFilter
          label={t("list.f.payment")}
          options={PAYMENT_TYPES.map((p) => ({ value: p, label: t(`paymentType.${p}`) }))}
          selected={filters.payments}
          onChange={(v) => apply({ payments: v })}
        />
        <DateChip
          label={t("list.f.date")}
          from={filters.orderFrom}
          to={filters.orderTo}
          invalid={t("list.dateInvalid")}
          onChange={(orderFrom, orderTo) => apply({ orderFrom, orderTo })}
        />
        {soldNow ? (
          <FilterChip label={soldLabel(soldNow, t)} what={t("list.soldPeriod")} onClear={() => apply({ soldFrom: null, soldTo: null })} />
        ) : null}
        {hasChips ? (
          <button
            type="button"
            onClick={clearAll}
            className="h-control-sm px-1.5 text-[13px] font-medium text-primary-button hover:underline"
          >
            {t("list.clearFilters")}
          </button>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          {canCreate ? <Checkbox label={t("list.mine")} checked={filters.mine} onChange={(v) => apply({ mine: v })} /> : null}
          <SavedViews
            storageKey="medix-orders-views"
            query={serializeOrderFilters({ ...filters, page: 1 })}
            hidden={hidden}
            onApply={(v) => {
              setSearch(new URLSearchParams(v.query).get("q") ?? "");
              setHidden(v.hidden);
              router.replace(v.query ? `${pathname}?${v.query}` : pathname, { scroll: false });
            }}
          />
          <div className="relative">
            <Button variant="secondary" size="sm" icon={Columns3} onClick={() => setColumnsOpen((o) => !o)} aria-expanded={columnsOpen}>
              {t("list.columns")}
            </Button>
            {columnsOpen ? (
              <div className="absolute right-0 z-30 mt-1 flex w-60 flex-col gap-2 rounded-control border border-border bg-surface p-3 shadow-overlay">
                {allColumns
                  .filter((c) => !ALWAYS.includes(c.key))
                  .map((c) => (
                    <Checkbox
                      key={c.key}
                      label={c.title}
                      checked={!hidden.includes(c.key)}
                      onChange={(on) => setHidden(on ? hidden.filter((h) => h !== c.key) : [...hidden, c.key])}
                    />
                  ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {orders.error ? (
        <ErrorState onRetry={() => orders.refetch()} />
      ) : (
        <Table
          caption={t("list.title")}
          columns={columns}
          rows={rows}
          rowKey={(o) => String(o.id)}
          loading={orders.isPending}
          onRowClick={(o) => openOrder(o.id)}
          selectable
          selectedKeys={selected}
          onSelectionChange={setSelected}
          bulkActions={
            <div className="flex items-center gap-2">
              <span className="font-medium">{t("list.selected", { count: formatQuantity(selected.length) })}</span>
              <Button
                variant="secondary"
                size="sm"
                icon={Printer}
                disabled={printable.length === 0}
                title={printable.length === 0 ? t("list.printNone") : undefined}
                onClick={() => window.open(`/print/picking?ids=${printable.map((o) => o.id).join(",")}`, "_blank")}
              >
                {t("list.printSheets")}
              </Button>
              <Button variant="tertiary" size="sm" onClick={() => setSelected([])}>
                {t("list.clearSelection")}
              </Button>
            </div>
          }
          sort={filters.sort === "CREATED" ? undefined : { key: SORT_COLUMN[filters.sort], dir: filters.desc ? "desc" : "asc" }}
          onSortChange={(s) => {
            const sort = COLUMN_SORT[s.key] ?? "CREATED";
            apply({ sort, desc: s.dir === "desc" });
          }}
          totals={
            current && current.count > 0
              ? {
                  number: <span className="font-medium">{t("list.totalRow", { count: formatQuantity(current.count) })}</span>,
                  total: <span className="font-medium tabular-nums">{formatMoney(current.total)}</span>,
                }
              : undefined
          }
          emptyState={
            filtered ? (
              <NoResultsState onClearFilters={clearAll} />
            ) : (
              <EmptyState icon={ClipboardList} title={t("list.emptyTitle")} description={t("list.emptyHint")} />
            )
          }
          pagination={
            orders.data && orders.data.total > PAGE_SIZES[0]
              ? {
                  page: filters.page,
                  pageSize: filters.size,
                  total: orders.data.total,
                  onPageChange: (page) => apply({ page }),
                  onPageSizeChange: (size) => apply({ size }),
                  pageSizeOptions: PAGE_SIZES,
                }
              : undefined
          }
        />
      )}
    </>
  );
}

const SORT_COLUMN: Record<OrderSort, string> = {
  CREATED: "",
  NUMBER: "number",
  DATE: "orderDate",
  CUSTOMER: "customer",
  TOTAL: "total",
};
const COLUMN_SORT: Record<string, OrderSort> = { number: "NUMBER", orderDate: "DATE", customer: "CUSTOMER", total: "TOTAL" };
