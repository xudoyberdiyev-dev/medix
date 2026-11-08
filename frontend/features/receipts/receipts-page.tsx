"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowUpRight, Ban, CircleCheck, Download, FilePen, PackageCheck, PackagePlus, Plus, Printer } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateChip, MultiFilter } from "@/components/ui/multi-filter";
import { RowMenu } from "@/components/ui/row-menu";
import { EmptyState, ErrorState, ForbiddenState, NoResultsState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { TextField } from "@/components/ui/text-field";
import { tashkentDay } from "@/components/ui/multi-filter";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { cn } from "@/lib/cn";
import { formatDate, formatMoney, formatQuantity } from "@/lib/format";
import { useBranchStore } from "@/lib/stores/branch";
import { RECEIPT_CREATE, useReceiptList, type ReceiptFacet, type ReceiptStatus, type ReceiptSummary } from "./api";
import {
  RECEIPT_PAGE_SIZES,
  RECEIPT_STATUSES,
  draftAgeDays,
  dueTone,
  parseReceiptFilters,
  receiptsExportHref,
  serializeReceiptFilters,
  type ReceiptFilters,
  type ReceiptSort,
} from "./list-state";

export function ReceiptStatusBadge({ status, extra }: { status: ReceiptStatus; extra?: string }) {
  const t = useTranslations("receipts");
  const map = {
    DRAFT: { tone: "neutral", icon: FilePen },
    ACCEPTED: { tone: "warning", icon: PackageCheck },
    POSTED: { tone: "success", icon: CircleCheck },
    CANCELLED: { tone: "danger", icon: Ban },
  } as const;
  return (
    <Badge tone={map[status].tone} icon={map[status].icon}>
      {t(`status.${status}`)}
      {extra ? <span className="max-w-40 truncate font-normal">· {extra}</span> : null}
    </Badge>
  );
}

export const day = (iso: string) => formatDate(new Date(`${iso}T00:00:00+05:00`));

const TONE_TEXT = { danger: "text-danger", warning: "text-warning", default: "", muted: "text-text-secondary" } as const;
const SORT_COLUMN: Record<ReceiptSort, string> = { CREATED: "", NUMBER: "number", DATE: "receiptDate", AMOUNT: "amount", DUE: "dueDate" };
const COLUMN_SORT: Record<string, ReceiptSort> = { number: "NUMBER", receiptDate: "DATE", amount: "AMOUNT", dueDate: "DUE" };

/** Bosiladigan karta (prototip `Receipts` KPI): yorliqqa oʻtkazadi. */
function KpiTile({
  label,
  value,
  sub,
  warn,
  onClick,
}: {
  label: string;
  value: string;
  sub?: string;
  warn?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label}: ${value}`}
      className="flex min-w-0 flex-col items-start gap-1 rounded-card border border-border bg-surface px-4 py-3.5 text-left transition-colors hover:border-primary/50"
    >
      <span className="text-[12.5px] text-text-secondary">{label}</span>
      <span className={cn("tabular text-kpi whitespace-nowrap", warn && "text-warning")}>{value}</span>
      {sub ? <span className={cn("text-caption", warn ? "text-warning" : "text-text-secondary")}>{sub}</span> : null}
    </button>
  );
}

const facetOptions = (facets: ReceiptFacet[] | undefined, selected: number[]) => {
  const list = (facets ?? []).map((f) => ({ value: f.id, label: f.name, count: f.count }));
  for (const id of selected) if (!list.some((o) => o.value === id)) list.push({ value: id, label: `#${id}`, count: 0 });
  return list;
};

/**
 * Kirim (prototip `Receipts`, SPEC 5.1): «Kirim N», yorliqlar (Hammasi / Qoralamalar / Qabul qilindi / Oʻtkazildi / Bekor qilingan —
 * soni bilan), qidiruv + Yetkazib beruvchi / Ombor / Sana chiplari, 4 karta, jadval (raqam, sana, YB, yuk xati, summa QQS bilan,
 * bonus, bonus tovar, toʻlov turi, toʻlov kuni, kim nomiga, holat), tanlash → Excel, saralash, 20/50/100; filtrlar URL'da.
 */
export function ReceiptsPage() {
  const t = useTranslations("receipts");
  const tcp = useTranslations("counterparties");
  const me = useMe();
  const selectedBranch = useBranchStore((s) => s.branchId);
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const filters = parseReceiptFilters(params);
  const [search, setSearch] = useState(filters.q);
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [selected, setSelected] = useState<string[]>([]);
  // Hujjat — toʻliq sahifa: /receipts/new, /receipts/<id>; eski ?open=<id> (bildirishnomalar) yoʻnaltiriladi
  const setEditor = (e: { id: number | null }) => router.push(e.id === null ? "/receipts/new" : `/receipts/${e.id}`);
  const openParam = params.get("open");
  useEffect(() => {
    const id = Number(openParam);
    if (Number.isInteger(id) && id > 0) router.replace(`/receipts/${id}`);
  }, [openParam, router]);
  const allowed = can(me.data, "receipt.view");
  const canCreate = can(me.data, RECEIPT_CREATE);
  const branchId = me.data?.allBranches ? (selectedBranch ?? null) : null;
  const docs = useReceiptList(filters, branchId, allowed);
  const [today] = useState(() => tashkentDay(Date.now()));

  useEffect(() => clearTimeout(debounce.current), []);

  if (me.data && !allowed) return <ForbiddenState description={t("list.forbidden")} />;

  const apply = (patch: Partial<ReceiptFilters>) => {
    const next = { ...filters, page: 1, ...patch };
    const qs = serializeReceiptFilters(next);
    setSelected([]);
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const clearAll = () => {
    setSearch("");
    apply({ q: "", suppliers: [], warehouses: [], from: null, to: null, status: null });
  };

  const data = docs.data;
  const count = (st: ReceiptStatus | null) => data?.statuses.find((s) => (s.status ?? null) === st)?.count;
  const tabs = [
    { key: "ALL", label: t("list.tab.ALL"), count: count(null) },
    ...RECEIPT_STATUSES.map((st) => ({ key: st, label: t(`list.tab.${st}`), count: count(st) })),
  ];
  const kpi = data?.kpi;
  const showAmount = (data?.items ?? []).some((d) => d.amount != null);
  const filtered = !!(filters.q.trim() || filters.suppliers.length || filters.warehouses.length || filters.from || filters.status);
  const hasChips = !!(filters.suppliers.length || filters.warehouses.length || filters.from);

  const columns: TableColumn<ReceiptSummary>[] = [
    {
      key: "number",
      title: t("list.col.number"),
      mono: true,
      sortable: true,
      render: (d) => <span className={d.status === "CANCELLED" ? "text-text-secondary" : undefined}>{d.number || t("list.noNumber")}</span>,
    },
    { key: "receiptDate", title: t("list.col.date"), sortable: true, render: (d) => day(d.receiptDate) },
    { key: "supplier", title: t("list.col.supplier"), render: (d) => <span className="block max-w-56 truncate">{d.supplier}</span> },
    {
      key: "invoiceNumber",
      title: t("list.col.invoice"),
      mono: true,
      render: (d) => <span className="text-text-secondary">{d.invoiceNumber ?? "—"}</span>,
    },
    ...(showAmount
      ? [
          {
            key: "amount",
            title: t("list.col.amount"),
            align: "right" as const,
            sortable: true,
            render: (d: ReceiptSummary) => (
              <span className={cn("tabular-nums", d.status === "CANCELLED" && "text-text-secondary line-through")}>
                {d.amount ? formatMoney(d.amount) : ""}
              </span>
            ),
          },
          {
            key: "bonus",
            title: t("list.col.bonus"),
            render: (d: ReceiptSummary) =>
              d.bonusAmount ? (
                <span className={cn("tabular-nums whitespace-nowrap", d.bonusConfirmed && "text-success")}>
                  {formatMoney(d.bonusAmount)}
                  {d.bonusDate ? ` · ${day(d.bonusDate)}` : ""}
                </span>
              ) : (
                <span className="text-text-secondary">—</span>
              ),
          },
        ]
      : []),
    {
      key: "bonusQty",
      title: t("list.col.bonusGoods"),
      align: "right",
      render: (d) =>
        d.bonusQty ? (
          <span className="tabular-nums text-success">{formatQuantity(d.bonusQty)}</span>
        ) : (
          <span className="text-text-secondary">—</span>
        ),
    },
    {
      key: "paymentType",
      title: t("list.col.payment"),
      render: (d) => <span className="text-text-secondary">{tcp(`paymentType.${d.paymentType}`)}</span>,
    },
    {
      key: "dueDate",
      title: t("list.col.due"),
      sortable: true,
      render: (d) =>
        d.fromBonus ? (
          <span className="text-success">{t("list.fromBonus")}</span>
        ) : d.prepaid ? (
          <span className="text-success">{t("list.prepaid")}</span>
        ) : (
          <span className={cn("tabular-nums", TONE_TEXT[dueTone(d.status, d.dueDate ?? null, today, d.paid)])}>
            {d.dueDate ? day(d.dueDate) : "—"}
          </span>
        ),
    },
    {
      key: "owner",
      title: t("list.col.owner"),
      render: (d) =>
        d.owner ? <span className="block max-w-40 truncate">{d.owner}</span> : <span className="text-text-secondary">—</span>,
    },
    {
      key: "status",
      title: t("list.col.status"),
      render: (d) => {
        const age = d.status === "DRAFT" ? draftAgeDays(d.receiptDate, today) : 0;
        const extra = age > 0 ? t("list.age", { days: age }) : d.status === "CANCELLED" ? (d.cancelReason ?? undefined) : undefined;
        return <ReceiptStatusBadge status={d.status} extra={extra} />;
      },
    },
  ];

  const rows = data?.items ?? [];
  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-4">
        <h1 className="flex items-baseline gap-2 text-page-title">
          {t("list.title")}
          {count(null) != null ? (
            <span className="text-body font-normal text-text-secondary tabular-nums" aria-label={t("list.countLabel")}>
              {formatQuantity(count(null) ?? 0)}
            </span>
          ) : null}
        </h1>
        <div className="flex items-center gap-2">
          <RowMenu
            label={t("list.more")}
            items={[
              {
                key: "export",
                label: t("list.export"),
                icon: <Download size={16} strokeWidth={1.5} aria-hidden />,
                onSelect: () => window.location.assign(receiptsExportHref(filters, branchId)),
              },
              {
                key: "print",
                label: t("list.print"),
                icon: <Printer size={16} strokeWidth={1.5} aria-hidden />,
                onSelect: () => window.print(),
              },
            ]}
          />
          {canCreate ? (
            <Button icon={Plus} onClick={() => setEditor({ id: null })}>
              {t("list.add")}
            </Button>
          ) : null}
        </div>
      </div>
      <div className="mb-3">
        <Tabs
          aria-label={t("list.tabsLabel")}
          items={tabs}
          value={filters.status ?? "ALL"}
          onChange={(k) => apply({ status: k === "ALL" ? null : (k as ReceiptStatus) })}
        />
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
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
        <MultiFilter
          label={t("list.f.supplier")}
          searchable
          options={facetOptions(data?.suppliers, filters.suppliers)}
          selected={filters.suppliers}
          onChange={(v) => apply({ suppliers: v })}
        />
        <MultiFilter
          label={t("list.f.warehouse")}
          options={facetOptions(data?.warehouses, filters.warehouses)}
          selected={filters.warehouses}
          onChange={(v) => apply({ warehouses: v })}
        />
        <DateChip
          label={t("list.f.date")}
          from={filters.from}
          to={filters.to}
          invalid={t("list.dateInvalid")}
          onChange={(from, to) => apply({ from, to })}
        />
        {hasChips ? (
          <button
            type="button"
            onClick={clearAll}
            className="h-control-sm px-1.5 text-[13px] font-medium text-primary-button hover:underline"
          >
            {t("list.clearFilters")}
          </button>
        ) : null}
      </div>
      {kpi ? (
        <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiTile
            label={t("list.kpi.drafts")}
            value={formatQuantity(kpi.drafts)}
            sub={kpi.oldDrafts ? t("list.kpi.oldDrafts", { count: formatQuantity(kpi.oldDrafts) }) : undefined}
            warn={kpi.oldDrafts > 0}
            onClick={() => apply({ status: "DRAFT" })}
          />
          <KpiTile
            label={t("list.kpi.accepted")}
            value={formatQuantity(kpi.accepted)}
            sub={kpi.accepted ? t("list.kpi.waitPost") : undefined}
            warn={kpi.accepted > 0}
            onClick={() => apply({ status: "ACCEPTED" })}
          />
          {kpi.expectedBonus != null ? (
            <KpiTile
              label={t("list.kpi.expectedBonus")}
              value={formatMoney(kpi.expectedBonus)}
              sub={t("list.kpi.docs", { count: formatQuantity(kpi.expectedBonusDocs) })}
              onClick={() => apply({ status: "POSTED" })}
            />
          ) : null}
          <KpiTile
            label={t("list.kpi.bonusGoods")}
            value={t("list.kpi.pcs", { count: formatQuantity(kpi.bonusGoodsMonth) })}
            onClick={() => apply({ status: "POSTED" })}
          />
        </div>
      ) : null}
      {docs.error ? (
        <ErrorState onRetry={() => docs.refetch()} />
      ) : (
        <Table
          caption={t("list.caption")}
          columns={columns}
          rows={rows}
          rowKey={(d) => String(d.id)}
          loading={docs.isPending}
          onRowClick={(d) => setEditor({ id: d.id })}
          rowActions={(d) => (
            <RowMenu
              items={[
                {
                  key: "open",
                  label: t("list.open"),
                  icon: <ArrowUpRight size={16} strokeWidth={1.5} aria-hidden />,
                  onSelect: () => setEditor({ id: d.id }),
                },
              ]}
            />
          )}
          selectable
          selectedKeys={selected}
          onSelectionChange={setSelected}
          bulkActions={
            <div className="flex items-center gap-2">
              <span className="font-medium">{t("list.selected", { count: formatQuantity(selected.length) })}</span>
              <Button
                variant="secondary"
                size="sm"
                icon={Download}
                onClick={() => window.location.assign(receiptsExportHref(filters, branchId, selected.map(Number)))}
              >
                {t("list.excel")}
              </Button>
              <Button variant="tertiary" size="sm" onClick={() => setSelected([])}>
                {t("list.clearSelection")}
              </Button>
            </div>
          }
          sort={filters.sort === "CREATED" ? undefined : { key: SORT_COLUMN[filters.sort], dir: filters.desc ? "desc" : "asc" }}
          onSortChange={(s) => apply({ sort: COLUMN_SORT[s.key] ?? "CREATED", desc: s.dir === "desc" })}
          emptyState={
            filtered ? (
              <NoResultsState onClearFilters={clearAll} />
            ) : (
              <EmptyState
                icon={PackagePlus}
                title={t("list.emptyTitle")}
                description={t("list.emptyDescription")}
                action={
                  canCreate ? (
                    <Button icon={Plus} onClick={() => setEditor({ id: null })}>
                      {t("list.add")}
                    </Button>
                  ) : undefined
                }
              />
            )
          }
          pagination={
            data && data.total > RECEIPT_PAGE_SIZES[0]
              ? {
                  page: filters.page,
                  pageSize: filters.size,
                  total: data.total,
                  onPageChange: (page) => apply({ page }),
                  onPageSizeChange: (size) => apply({ size }),
                  pageSizeOptions: RECEIPT_PAGE_SIZES,
                }
              : undefined
          }
        />
      )}
    </>
  );
}
