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
  Truck,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/selection-controls";
import { EmptyState, ErrorState, ForbiddenState, NoResultsState } from "@/components/ui/system-states";
import { FilterChip } from "@/components/ui/filter-chip";
import { Table, type TableColumn } from "@/components/ui/table";
import { type TabItem, Tabs } from "@/components/ui/tabs";
import { TextField } from "@/components/ui/text-field";
import { can, canAny } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import type { components } from "@/lib/api/schema";
import { formatDate, formatMoney, formatQuantity } from "@/lib/format";
import { useBranchStore } from "@/lib/stores/branch";
import { useHiddenColumns } from "@/lib/use-hidden-columns";
import { SavedViews } from "@/components/ui/saved-views";
import { formatIsoDate, parseUzDate } from "@/features/counterparties/api";
import { ORDER_CREATE, useOrders, type OrderStatus, type OrderSummary } from "./api";
import type { OrdersT } from "./i18n";
import { OrderDrawer } from "./order-drawer";
import {
  DEFAULT_ORDER_FILTERS,
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

/** Sana maydoni (KK.OO.YYYY): toʻgʻri yoki boʻsh boʻlsa — darhol qoʻllanadi. */
function DayField({
  label,
  value,
  onApply,
  invalid,
}: {
  label: string;
  value: string | null;
  onApply: (iso: string | null) => void;
  invalid: string;
}) {
  const [text, setText] = useState(formatIsoDate(value));
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    // URL tashqaridan oʻzgardi (koʻrinish, tozalash) — maydon ham yangilanadi
    setSeen(value);
    setText(formatIsoDate(value));
  }
  const parsed = parseUzDate(text);
  return (
    <div className="w-36">
      <TextField
        label={label}
        size="sm"
        value={text}
        placeholder="04.10.2026"
        error={parsed === null ? invalid : undefined}
        onChange={(v) => {
          setText(v);
          const iso = parseUzDate(v);
          if (iso !== null && (iso ?? null) !== value) onApply(iso ?? null);
        }}
      />
    </div>
  );
}

/**
 * Buyurtmalar (SPEC 5.2, jadval standarti SPEC 120): holat yorliqlari (soni, summasi), «Hozir kimda», qidiruv (raqam, mijoz, STIR —
 * lotin/kirill farqsiz), buyurtma sanasi, saralash, «Ustunlar», «Koʻrinishlar», .xlsx eksport, jami qatori; filtrlar URL'da.
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
  // Bildirishnomadan oʻtish: ?open=<id> — buyurtma kartochkasi darhol ochiladi
  const [editor, setEditor] = useState<{ id: number | null } | null>(() => {
    const id = Number(params.get("open"));
    return Number.isInteger(id) && id > 0 ? { id } : null;
  });
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);
  const allowed = canAny(me.data, ["orders.view", "approvals.view"]);
  const canCreate = can(me.data, ORDER_CREATE);
  const branchId = me.data?.allBranches ? (selectedBranch ?? null) : null;
  const orders = useOrders(filters, branchId);

  const apply = (patch: Partial<OrderFilters>) => {
    const next = { ...filters, ...patch, ...("page" in patch ? {} : { page: 1 }) };
    const qs = serializeOrderFilters(next);
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  if (me.data && !allowed) return <ForbiddenState description={t("list.forbidden")} />;

  const allColumns: TableColumn<OrderSummary>[] = [
    { key: "number", title: t("list.col.number"), mono: true, sortable: true },
    { key: "orderDate", title: t("list.col.date"), sortable: true, render: (o) => day(o.orderDate) },
    { key: "customer", title: t("list.col.customer"), sortable: true },
    {
      key: "deliveryType",
      title: t("list.col.delivery"),
      render: (o) =>
        o.deliveryType === "PICKUP"
          ? t("list.pickup")
          : o.deliveryDate
            ? t("list.deliveryOn", { date: day(o.deliveryDate) })
            : t("list.delivery"),
    },
    {
      key: "lines",
      title: t("list.col.lines"),
      align: "right",
      render: (o) => <span className="tabular-nums">{formatQuantity(o.lines)}</span>,
    },
    {
      key: "total",
      title: t("list.col.total"),
      align: "right",
      sortable: true,
      render: (o) => <span className="tabular-nums">{formatMoney(o.total)}</span>,
    },
    {
      key: "paymentType",
      title: t("list.col.paymentType"),
      render: (o) => t(`paymentType.${o.paymentType}`),
    },
    { key: "createdBy", title: t("list.col.operator") },
    { key: "holder", title: t("list.col.holder"), render: (o) => <span className="text-caption text-text-secondary">{o.holder}</span> },
    {
      key: "status",
      title: t("list.col.status"),
      render: (o) => (
        <span className="flex items-center gap-2">
          <OrderStatusBadge status={o.status} />
          {o.approvalLevel === "DIRECTOR" && o.status === "PENDING_APPROVAL" ? <Badge tone="warning">{t("list.director")}</Badge> : null}
        </span>
      ),
    },
  ];
  const columns = allColumns.filter((c) => ALWAYS.includes(c.key) || !hidden.includes(c.key));

  const filtered = hasOrderFilters(filters);
  const clearAll = () => (setSearch(""), apply({ ...DEFAULT_ORDER_FILTERS, sort: filters.sort, desc: filters.desc }));
  const current = orders.data?.statuses.find((x) => (x.status ?? null) === filters.status) ?? orders.data?.statuses[0];
  const soldNow = filters.soldFrom || filters.soldTo ? { from: filters.soldFrom, to: filters.soldTo } : null;
  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-page-title">{t("list.title")}</h1>
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
            <Button icon={Plus} onClick={() => setEditor({ id: null })}>
              {t("list.create")}
            </Button>
          ) : null}
        </div>
      </div>
      {orders.data ? (
        <div className="mb-3 flex flex-col gap-2">
          <Tabs
            aria-label={t("list.statusTabs")}
            items={statusTabs(orders.data.statuses, t)}
            value={filters.status ?? ALL}
            onChange={(k) => apply({ status: k === ALL ? null : (k as OrderStatus) })}
          />
          <p className="text-caption text-text-secondary tabular-nums">{tabSummary(orders.data.statuses, filters.status, t)}</p>
        </div>
      ) : null}
      {orders.error ? (
        <ErrorState onRetry={() => orders.refetch()} />
      ) : (
        <Table
          caption={t("list.title")}
          columns={columns}
          rows={orders.data?.items ?? []}
          rowKey={(o) => String(o.id)}
          loading={orders.isPending}
          activeKey={editor?.id != null ? String(editor.id) : undefined}
          onRowClick={(o) => setEditor({ id: o.id })}
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
          toolbar={
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-end gap-3">
                <div className="w-80">
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
                <DayField
                  label={t("list.orderFrom")}
                  value={filters.orderFrom}
                  invalid={t("list.dateInvalid")}
                  onApply={(v) => apply({ orderFrom: v })}
                />
                <DayField
                  label={t("list.orderTo")}
                  value={filters.orderTo}
                  invalid={t("list.dateInvalid")}
                  onApply={(v) => apply({ orderTo: v })}
                />
                {canCreate ? <Checkbox label={t("list.mine")} checked={filters.mine} onChange={(v) => apply({ mine: v })} /> : null}
                <div className="ml-auto flex items-center gap-2">
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
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={Columns3}
                      onClick={() => setColumnsOpen((o) => !o)}
                      aria-expanded={columnsOpen}
                    >
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
              {filters.customer || filters.operator || soldNow ? (
                <div className="flex flex-wrap items-center gap-2">
                  {filters.customer ? (
                    <FilterChip
                      label={t("list.customerChip", { name: filters.customer.name })}
                      what={t("list.customer")}
                      onClear={() => apply({ customer: null })}
                    />
                  ) : null}
                  {filters.operator ? (
                    <FilterChip
                      label={t("list.operatorChip", { name: filters.operator.name })}
                      what={t("list.operator")}
                      onClear={() => apply({ operator: null })}
                    />
                  ) : null}
                  {soldNow ? (
                    <FilterChip
                      label={soldLabel(soldNow, t)}
                      what={t("list.soldPeriod")}
                      onClear={() => apply({ soldFrom: null, soldTo: null })}
                    />
                  ) : null}
                </div>
              ) : null}
            </div>
          }
          emptyState={
            filtered ? (
              <NoResultsState onClearFilters={clearAll} />
            ) : (
              <EmptyState icon={ClipboardList} title={t("list.emptyTitle")} description={t("list.emptyHint")} />
            )
          }
          pagination={
            orders.data && orders.data.total > 50
              ? {
                  page: filters.page,
                  pageSize: 50,
                  total: orders.data.total,
                  onPageChange: (page) => apply({ page }),
                  onPageSizeChange: () => undefined,
                  pageSizeOptions: [50],
                }
              : undefined
          }
        />
      )}
      {editor ? <OrderDrawer id={editor.id} onClose={() => setEditor(null)} onCreated={(id) => setEditor({ id })} /> : null}
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
