"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  Boxes,
  ChevronDown,
  ChevronRight,
  CircleX,
  Download,
  Printer,
  ShieldAlert,
  SlidersHorizontal,
  TriangleAlert,
  Truck,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ColumnsMenu, useColumnPrefs } from "@/components/ui/columns-menu";
import { MultiFilter, type FilterOption } from "@/components/ui/multi-filter";
import { RowMenu } from "@/components/ui/row-menu";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState, ErrorState, ForbiddenState, NoResultsState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { TextField } from "@/components/ui/text-field";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { cn } from "@/lib/cn";
import { formatMoney, formatQuantity } from "@/lib/format";
import { useBranchStore } from "@/lib/stores/branch";
import {
  DEFAULT_OVERVIEW,
  EXPIRY_BUCKETS,
  OVERVIEW_PAGE_SIZES,
  PRODUCT_SORT_COLUMNS,
  STOCK_FLAGS,
  STOCK_STATES,
  ZONE_TYPES,
  hasAnyFilter,
  hasMoreFilters,
  kpiActive,
  kpiPatch,
  parseOverview,
  productQuery,
  batchQuery,
  serializeOverview,
  type KpiKey,
  type OverviewFilters,
  type StockFlag,
} from "./overview-state";
import { stockExportHref } from "./stock-page";
import { BatchPanel } from "./batch-panel";
import { ExpiryCell, Flags, day } from "./stock-cells";
import { BATCH_COLUMN_KEYS, BATCH_COST_KEYS, StockBatches, batchColumnLabels } from "./stock-batches";
import { StockTransit } from "./stock-transit";
import { StockTree } from "./stock-tree";

type ProductRow = components["schemas"]["ProductStockRow"];

/** Prototip `Stock` → PCOLS tartibida («Ustunlar» menyusi; ochish ustuni doim birinchi). */
const PRODUCT_COLUMN_KEYS = [
  "code",
  "name",
  "manufacturer",
  "category",
  "country",
  "unit",
  "total",
  "reserved",
  "available",
  "closed",
  "shipping",
  "batches",
  "nearestExpiry",
  "costSum",
  "saleSum",
  "lastIn",
  "supplyBy",
  "flags",
] as const;
type StockRow = components["schemas"]["StockRow"];
type Facet = components["schemas"]["Facet"];

function KpiTile({
  label,
  value,
  unit,
  note,
  icon: I,
  tone,
  active,
  onClick,
  href,
}: {
  label: string;
  value: string;
  unit?: string;
  note: string;
  icon?: LucideIcon;
  tone?: "warning" | "danger" | "info";
  active?: boolean;
  onClick?: () => void;
  href?: string;
}) {
  const color = tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : tone === "info" ? "text-info" : "";
  const body = (
    <>
      <span className="flex items-center gap-1.5 text-caption text-text-secondary">
        {I ? <I size={14} strokeWidth={1.5} className={color} aria-hidden /> : null}
        {label}
      </span>
      <span className="flex max-w-full min-w-0 items-baseline gap-1.5 whitespace-nowrap">
        <span
          title={value}
          className={cn(
            "tabular truncate leading-7 font-semibold",
            value.length > 12 ? "text-[clamp(15px,1.15vw,22px)]" : "text-[clamp(18px,1.6vw,24px)]",
            color,
          )}
        >
          {value}
        </span>
        {unit ? <span className="text-caption text-text-secondary">{unit}</span> : null}
      </span>
      <span className="text-caption text-text-secondary">{note}</span>
    </>
  );
  const cls = cn(
    "flex min-w-0 flex-col items-start gap-1 rounded-card border bg-surface p-4 text-left transition-colors",
    active ? "border-primary bg-primary-soft" : "border-border",
    (onClick || href) && "hover:border-primary/50",
  );
  if (href)
    return (
      <Link href={href} className={cls}>
        {body}
      </Link>
    );
  if (!onClick) return <div className={cls}>{body}</div>;
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={cls}>
      {body}
    </button>
  );
}

const facetOptions = (facets: Facet[] | undefined, selected: number[], none: string): FilterOption<number>[] => {
  const list = (facets ?? []).map((f) => ({ value: f.id, label: f.id === 0 ? none : (f.name ?? "—"), count: f.count }));
  for (const id of selected) if (!list.some((o) => o.value === id)) list.push({ value: id, label: `#${id}`, count: 0 });
  return list;
};

/** Mahsulot qatori ochilganda — partiya × zona (prototip `kidsHead`): ombor, zona, partiya, ishlab chiqarilgan, yaroqlilik, soni, band, mavjud, tannarx, kirim hujjati, yetkazib beruvchi. */
function BatchKids({
  product,
  branchId,
  onOpen,
}: {
  product: ProductRow;
  branchId: number | null;
  onOpen: (batchId: number, zoneId: number) => void;
}) {
  const t = useTranslations("stock");
  const rows = useQuery({
    queryKey: ["stock", "kids", product.productId, branchId],
    queryFn: () =>
      unwrap(
        api.GET("/api/stock", {
          params: { query: { q: product.code, branchId: branchId ?? undefined, sort: "EXPIRY", size: 200 } },
        }),
      ),
  });
  if (rows.isPending)
    return (
      <div className="flex justify-center p-4">
        <Spinner />
      </div>
    );
  if (rows.error) return <ErrorState onRetry={() => rows.refetch()} />;
  const items = (rows.data?.items ?? []).filter((r: StockRow) => r.productId === product.productId);
  const showCost = items.some((r) => r.cost != null);
  return (
    <div className="overflow-x-auto px-4 py-3 pl-12">
      <p className="mb-2 text-caption font-medium text-text-secondary">{t("ov.kidsHead")}</p>
      <table className="w-full min-w-[960px] text-[13px]">
        <thead>
          <tr className="text-left text-caption text-text-secondary">
            <th className="py-1.5 pr-3 font-medium">{t("ov.c.wh")}</th>
            <th className="py-1.5 pr-3 font-medium">{t("ov.c.zone")}</th>
            <th className="py-1.5 pr-3 font-medium">{t("ov.c.batch")}</th>
            <th className="py-1.5 pr-3 font-medium">{t("ov.c.mfg")}</th>
            <th className="py-1.5 pr-3 font-medium">{t("ov.c.exp")}</th>
            <th className="py-1.5 pr-3 text-right font-medium">{t("ov.c.qty")}</th>
            <th className="py-1.5 pr-3 text-right font-medium">{t("ov.c.reserved")}</th>
            <th className="py-1.5 pr-3 text-right font-medium">{t("ov.c.available")}</th>
            {showCost ? <th className="py-1.5 pr-3 text-right font-medium">{t("ov.c.cost")}</th> : null}
            <th className="py-1.5 pr-3 font-medium">{t("ov.c.doc")}</th>
            <th className="py-1.5 pr-3 font-medium">{t("ov.c.supplier")}</th>
            <th className="py-1.5 font-medium">{t("ov.c.flags")}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((r) => {
            const avail = r.sellable && r.daysLeft >= 0 ? r.qty - r.reserved : 0;
            return (
              <tr
                key={`${r.zoneId}:${r.batchId}`}
                className="cursor-pointer border-t border-border transition-colors hover:bg-table-header"
                title={t("ov.bp.open")}
                onClick={(e) => {
                  if (!(e.target as HTMLElement).closest("a")) onOpen(r.batchId, r.zoneId);
                }}
              >
                <td className="py-1.5 pr-3">{r.warehouse}</td>
                <td className="py-1.5 pr-3">
                  <Badge tone={r.zoneType === "QUARANTINE" ? "warning" : r.zoneType === "COLD" ? "info" : "neutral"}>{r.zone}</Badge>
                </td>
                <td className="py-1.5 pr-3 font-mono text-mono">{r.batchNumber}</td>
                <td className="py-1.5 pr-3">{r.producedOn ? day(r.producedOn) : <span className="text-text-secondary">—</span>}</td>
                <td className="py-1.5 pr-3">
                  <ExpiryCell date={r.expiryDate} days={r.daysLeft} />
                </td>
                <td className="tabular py-1.5 pr-3 text-right font-medium">{formatQuantity(r.qty)}</td>
                <td className={cn("tabular py-1.5 pr-3 text-right", !r.reserved && "text-text-secondary")}>{formatQuantity(r.reserved)}</td>
                <td className={cn("tabular py-1.5 pr-3 text-right font-medium", !avail && "text-text-secondary")}>
                  {formatQuantity(avail)}
                </td>
                {showCost ? (
                  <td className="tabular py-1.5 pr-3 text-right text-text-secondary">{r.cost ? formatMoney(r.cost) : ""}</td>
                ) : null}
                <td className="py-1.5 pr-3">
                  {r.receiptId ? (
                    <Link href={`/receipts/${r.receiptId}`} className="font-mono text-mono text-primary hover:underline">
                      {r.receiptNumber}
                    </Link>
                  ) : (
                    <span className="text-text-secondary">{r.sourceType === "BQ" ? t("ov.opening") : r.sourceType}</span>
                  )}
                </td>
                <td className="py-1.5 pr-3">{r.supplier ?? <span className="text-text-secondary">—</span>}</td>
                <td className="py-1.5">{r.bonus ? <Flags flags={["BONUS"]} /> : null}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Qoldiqlar (prototip `Stock`): «Qoldiqlar N», 6 karta (mahsulotlar, tannarxda qoldiq, muddati yaqin, muddati oʻtgan, karantinda —
 * filtr sifatida bosiladi; yoʻlda — koʻchirishlarga), koʻrinishlar «Mahsulot boʻyicha» / «Partiya boʻyicha», qidiruv va chiplar
 * (Filial/Ombor, Zona, Muddat, Qoldiq; «Koʻproq filtrlar» — Ishlab chiqaruvchi, Kategoriya, Davlat, Taʼminot masʼuli, Yetkazib
 * beruvchi, Belgilar — variantlar soni bilan), mahsulot jadvali (ochilsa — partiya × zona), jami qatori, 25/50/100; URL'da.
 */
export function StockOverview() {
  const t = useTranslations("stock");
  const me = useMe();
  const branchId = useBranchStore((s) => s.branchId);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const f = parseOverview(new URLSearchParams(params.toString()));
  const [search, setSearch] = useState(f.q);
  const [more, setMore] = useState(hasMoreFilters(f));
  const [open, setOpen] = useState<string[]>([]);
  const [panel, setPanel] = useState<{ batchId: number; zoneId: number } | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);
  const apply = (patch: Partial<OverviewFilters>) => {
    const qs = serializeOverview({ ...f, page: 1, ...patch });
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const allowed = can(me.data, "stock.view");

  const summary = useQuery({
    queryKey: ["stock", "summary", branchId],
    queryFn: () => unwrap(api.GET("/api/stock/summary", { params: { query: { branchId: branchId ?? undefined } } })),
    enabled: allowed,
  });
  const query = productQuery(f, branchId);
  const products = useQuery({
    queryKey: ["stock", "products", query],
    queryFn: () => unwrap(api.GET("/api/stock/products", { params: { query } })),
    enabled: allowed && f.view === "product",
    placeholderData: keepPreviousData,
  });
  const bQuery = batchQuery(f, branchId);
  const batches = useQuery({
    queryKey: ["stock", "batches", bQuery],
    queryFn: () => unwrap(api.GET("/api/stock/batches", { params: { query: bQuery } })),
    enabled: allowed && f.view === "batch" && !f.transit,
    placeholderData: keepPreviousData,
  });
  const pPrefs = useColumnPrefs("medix-stock-pcols-v1", PRODUCT_COLUMN_KEYS);
  const bPrefs = useColumnPrefs("medix-stock-bcols-v1", BATCH_COLUMN_KEYS);

  if (me.data && !allowed) return <ForbiddenState description={t("forbidden")} />;

  const s = summary.data;
  const showCost = s ? s.value != null : false;
  const err = Boolean(summary.error);
  const kpi = (k: KpiKey) => ({ active: kpiActive(f, k), onClick: () => apply(kpiPatch(f, k)) });
  const countOf = (list: { code: string; count: number }[] | undefined, code: string) => list?.find((x) => x.code === code)?.count;
  const none = t("ov.none");

  const allColumns: TableColumn<ProductRow>[] = [
    {
      key: "expand",
      title: "",
      width: 36,
      render: (r) =>
        r.batches > 0 ? (
          open.includes(String(r.productId)) ? (
            <ChevronDown size={16} strokeWidth={1.5} className="text-text-secondary" aria-hidden />
          ) : (
            <ChevronRight size={16} strokeWidth={1.5} className="text-text-secondary" aria-hidden />
          )
        ) : null,
    },
    { key: "code", title: t("ov.c.code"), mono: true, width: 104, sortable: true },
    {
      key: "name",
      title: t("ov.c.name"),
      sortable: true,
      width: 260,
      render: (r) => (
        <span className="flex flex-col">
          <span className="block max-w-[260px] truncate font-medium" title={r.name}>
            {r.name}
          </span>
          <span className="text-caption text-text-secondary">{[r.manufacturer, r.unit].filter(Boolean).join(" · ")}</span>
        </span>
      ),
    },
    { key: "manufacturer", title: t("ov.c.maker"), render: (r) => r.manufacturer ?? "—" },
    { key: "category", title: t("ov.c.cat"), render: (r) => r.category ?? "—" },
    { key: "country", title: t("ov.c.country"), render: (r) => r.country ?? "—" },
    { key: "unit", title: t("ov.c.unit") },
    {
      key: "total",
      title: t("ov.c.total"),
      align: "right",
      sortable: true,
      render: (r) => <b className="font-semibold">{formatQuantity(r.total)}</b>,
    },
    {
      key: "reserved",
      title: t("ov.c.reserved"),
      align: "right",
      sortable: true,
      render: (r) => <span className={cn(!r.reserved && "text-text-secondary")}>{formatQuantity(r.reserved)}</span>,
    },
    {
      key: "available",
      title: t("ov.c.available"),
      align: "right",
      sortable: true,
      render: (r) => <b className={cn("font-semibold", !r.available && "text-text-secondary")}>{formatQuantity(r.available)}</b>,
    },
    {
      key: "closed",
      title: t("ov.c.closed"),
      align: "right",
      render: (r) => (
        <span title={t("ov.closedTip")} className={r.closed ? "text-warning" : "text-text-secondary"}>
          {formatQuantity(r.closed)}
        </span>
      ),
    },
    {
      key: "shipping",
      title: t("ov.c.ship"),
      align: "right",
      render: (r) => <span className={cn(!r.shipping && "text-text-secondary")}>{formatQuantity(r.shipping)}</span>,
    },
    { key: "batches", title: t("ov.c.batches"), align: "right", sortable: true, render: (r) => formatQuantity(r.batches) },
    {
      key: "nearestExpiry",
      title: t("ov.c.near"),
      sortable: true,
      render: (r) => <ExpiryCell date={r.nearestExpiry} days={r.nearestDays} />,
    },
    ...(showCost
      ? [
          {
            key: "costSum",
            title: t("ov.c.costSum"),
            align: "right" as const,
            sortable: true,
            render: (r: ProductRow) => (r.costSum ? formatMoney(r.costSum) : ""),
          },
        ]
      : []),
    { key: "saleSum", title: t("ov.c.saleSum"), align: "right", sortable: true, render: (r) => formatMoney(r.saleSum) },
    { key: "lastIn", title: t("ov.c.lastIn"), sortable: true, render: (r) => (r.lastIn ? day(r.lastIn) : "—") },
    { key: "supplyBy", title: t("ov.c.supplyBy"), render: (r) => r.supplyBy ?? "—" },
    {
      key: "flags",
      title: t("ov.c.flags"),
      render: (r) => (
        <Flags
          flags={[r.marked && "MARKED", r.controlled && "CONTROLLED", r.prescription && "PRESCRIPTION", r.bonus && "BONUS"].filter(
            (x): x is StockFlag => Boolean(x),
          )}
        />
      ),
    },
  ];
  const byKey = new Map(allColumns.map((c) => [c.key, c]));
  const columns = [byKey.get("expand"), ...pPrefs.cols.filter((c) => c.visible).map((c) => byKey.get(c.key))].filter(
    (c): c is TableColumn<ProductRow> => Boolean(c),
  );
  const pLabels = Object.fromEntries(allColumns.filter((c) => c.key !== "expand").map((c) => [c.key, c.title]));
  const bLabels = batchColumnLabels((k) => t(k as Parameters<typeof t>[0]));
  const showBatchCost = batches.data ? batches.data.costSum != null : false;
  const colsMenu =
    f.view === "batch" ? (
      <ColumnsMenu
        label={t("ov.columns")}
        hint={t("ov.colsHint")}
        resetLabel={t("ov.colsReset")}
        columns={bPrefs.cols.filter((c) => showBatchCost || !BATCH_COST_KEYS.includes(c.key as (typeof BATCH_COST_KEYS)[number]))}
        labels={bLabels}
        onChange={(next) => bPrefs.update([...next, ...bPrefs.cols.filter((c) => !next.some((x) => x.key === c.key))])}
        onReset={bPrefs.reset}
      />
    ) : (
      <ColumnsMenu
        label={t("ov.columns")}
        hint={t("ov.colsHint")}
        resetLabel={t("ov.colsReset")}
        columns={pPrefs.cols.filter((c) => byKey.has(c.key))}
        labels={pLabels}
        onChange={(next) => pPrefs.update([...next, ...pPrefs.cols.filter((c) => !next.some((x) => x.key === c.key))])}
        onReset={pPrefs.reset}
      />
    );
  const sortKey = Object.entries(PRODUCT_SORT_COLUMNS).find(([, v]) => v === (f.sort ?? "NAME"))?.[0] ?? "name";
  const data = products.data;
  const toggle = (id: string) => setOpen((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));
  const exportHref = stockExportHref({ q: f.q, warehouseId: null, sellableOnly: false });
  const clearAll = () => apply({ ...DEFAULT_OVERVIEW, q: f.q, view: f.view });

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="flex items-baseline gap-2 text-page-title">
          {t("titleStock")}
          {data && f.view === "product" ? (
            <span className="text-body font-normal text-text-secondary tabular-nums">{formatQuantity(data.total)}</span>
          ) : null}
        </h1>
        <RowMenu
          label={t("ov.more")}
          items={[
            {
              key: "export",
              label: t("export"),
              icon: <Download size={16} strokeWidth={1.5} aria-hidden />,
              onSelect: () => window.location.assign(exportHref),
            },
            {
              key: "print",
              label: t("ov.print"),
              icon: <Printer size={16} strokeWidth={1.5} aria-hidden />,
              onSelect: () => window.print(),
            },
          ]}
        />
      </div>

      <div className={cn("mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2", showCost ? "xl:grid-cols-6" : "xl:grid-cols-5")}>
        <KpiTile label={t("ov.k.products")} value={s ? formatQuantity(s.products) : err ? "—" : "…"} note={t("ov.k.productsN")} />
        {showCost && s?.value ? <KpiTile label={t("ov.k.value")} value={formatMoney(s.value)} note={t("ov.k.som")} /> : null}
        <KpiTile
          label={t("ov.k.near")}
          value={s ? String(s.near) : "—"}
          unit={t("ov.k.batchUnit")}
          note={t("ov.k.nearN")}
          icon={TriangleAlert}
          tone="warning"
          {...kpi("near")}
        />
        <KpiTile
          label={t("ov.k.expired")}
          value={s ? String(s.expired) : "—"}
          unit={t("ov.k.batchUnit")}
          note={t("ov.k.expiredN")}
          icon={CircleX}
          tone="danger"
          {...kpi("expired")}
        />
        <KpiTile
          label={t("ov.k.quar")}
          value={s ? String(s.quarantine) : "—"}
          unit={t("ov.k.batchUnit")}
          note={t("ov.k.quarN")}
          icon={ShieldAlert}
          tone="warning"
          {...kpi("quar")}
        />
        <KpiTile
          label={t("ov.k.transit")}
          value={s ? formatQuantity(s.transitQty) : "—"}
          unit={t("unitItems")}
          note={t("ov.k.transitN", { n: s?.transitDocs ?? 0 })}
          icon={Truck}
          tone="info"
          {...kpi("transit")}
        />
      </div>

      <div className="mb-3">
        <Tabs
          aria-label={t("ov.views")}
          items={[
            { key: "product", label: t("ov.vProduct") },
            { key: "batch", label: t("ov.vBatch") },
            { key: "wh", label: t("ov.vWh") },
          ]}
          value={f.view}
          onChange={(k) => {
            const view = k === "batch" || k === "wh" ? k : "product";
            // Prototip: koʻrinish almashganda filtrlar saqlanadi (ombor daraxtida — faqat qidiruv)
            const qs = serializeOverview(view === "wh" ? { ...DEFAULT_OVERVIEW, q: f.q, view } : { ...f, view, transit: false, page: 1 });
            router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
          }}
        />
      </div>

      {f.transit ? (
        <StockTransit branchId={branchId} />
      ) : f.view === "wh" ? (
        <StockTree
          branchId={branchId}
          onPickZone={(wh, zone) => apply({ ...DEFAULT_OVERVIEW, view: "product", warehouses: [wh], zones: [zone] })}
        />
      ) : (
        <>
          {f.view === "batch" ? <p className="mb-2 text-caption text-text-secondary">{t("ov.fefo")}</p> : null}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="w-96 max-w-full">
              <TextField
                label={t("search")}
                variant="search"
                size="sm"
                value={search}
                onChange={(v) => {
                  setSearch(v);
                  clearTimeout(debounce.current);
                  debounce.current = setTimeout(() => apply({ q: v.trim() }), 300);
                }}
                placeholder={t("ov.searchPh")}
                className="[&>label]:sr-only"
              />
            </div>
            <MultiFilter
              label={t("ov.f.wh")}
              options={facetOptions(s?.warehouses, f.warehouses, none)}
              selected={f.warehouses}
              onChange={(v) => apply({ warehouses: v })}
            />
            <MultiFilter
              label={t("ov.f.zone")}
              options={ZONE_TYPES.map((z) => ({ value: z, label: t(`ov.zone.${z}`), count: countOf(s?.zoneTypes, z) ?? 0 }))}
              selected={f.zones}
              onChange={(v) => apply({ zones: v })}
            />
            <MultiFilter
              label={t("ov.f.exp")}
              options={EXPIRY_BUCKETS.map((e) => ({ value: e, label: t(`ov.exp.${e}`), count: countOf(s?.expiry, e) ?? 0 }))}
              selected={f.expiry}
              onChange={(v) => apply({ expiry: v })}
            />
            <MultiFilter
              label={t("ov.f.stock")}
              options={STOCK_STATES.map((x) => ({ value: x, label: t(`ov.st.${x}`) }))}
              selected={f.stock}
              onChange={(v) => apply({ stock: v })}
            />
            <button
              type="button"
              onClick={() => setMore((m) => !m)}
              aria-expanded={more}
              className="inline-flex h-control-sm items-center gap-1.5 px-1.5 text-[13px] font-medium text-primary-button hover:underline"
            >
              <SlidersHorizontal size={14} strokeWidth={1.5} aria-hidden />
              {t("ov.moreFilters")}
            </button>
            {hasAnyFilter(f) ? (
              <button
                type="button"
                onClick={clearAll}
                className="h-control-sm px-1.5 text-[13px] font-medium text-primary-button hover:underline"
              >
                {t("ov.clearAll")}
              </button>
            ) : null}
            <div className="ml-auto">{colsMenu}</div>
          </div>
          {more ? (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <MultiFilter
                label={t("ov.f.maker")}
                searchable
                options={facetOptions(s?.manufacturers, f.manufacturers, none)}
                selected={f.manufacturers}
                onChange={(v) => apply({ manufacturers: v })}
              />
              <MultiFilter
                label={t("ov.f.cat")}
                searchable
                options={facetOptions(s?.categories, f.categories, none)}
                selected={f.categories}
                onChange={(v) => apply({ categories: v })}
              />
              <MultiFilter
                label={t("ov.f.country")}
                options={facetOptions(s?.countries, f.countries, none)}
                selected={f.countries}
                onChange={(v) => apply({ countries: v })}
              />
              <MultiFilter
                label={t("ov.f.supply")}
                options={facetOptions(s?.supplyBy, f.supplyBy, t("ov.noSupply"))}
                selected={f.supplyBy}
                onChange={(v) => apply({ supplyBy: v })}
              />
              <MultiFilter
                label={t("ov.f.supplier")}
                searchable
                options={facetOptions(s?.suppliers, f.suppliers, t("ov.noSupplier"))}
                selected={f.suppliers}
                onChange={(v) => apply({ suppliers: v })}
              />
              <MultiFilter
                label={t("ov.f.flags")}
                options={STOCK_FLAGS.map((x) => ({ value: x, label: t(`ov.flag.${x}`) }))}
                selected={f.flags}
                onChange={(v) => apply({ flags: v })}
              />
            </div>
          ) : null}
          {f.view === "batch" ? (
            <StockBatches
              f={f}
              data={batches.data}
              loading={batches.isPending}
              error={Boolean(batches.error)}
              onRetry={() => batches.refetch()}
              cols={bPrefs.cols}
              apply={apply}
              onOpen={(batchId, zoneId) => setPanel({ batchId, zoneId })}
              onClearFilters={() => (setSearch(""), apply({ ...DEFAULT_OVERVIEW, view: "batch" }))}
              filtered={Boolean(f.q) || hasAnyFilter(f)}
            />
          ) : products.error ? (
            <ErrorState onRetry={() => products.refetch()} />
          ) : (
            <Table
              caption={t("titleStock")}
              columns={columns}
              rows={data?.items ?? []}
              rowKey={(r) => String(r.productId)}
              loading={products.isPending}
              sort={{ key: sortKey, dir: f.desc ? "desc" : "asc" }}
              onSortChange={(x) => apply({ sort: PRODUCT_SORT_COLUMNS[x.key] ?? null, desc: x.dir === "desc" })}
              onRowClick={(r) => r.batches > 0 && toggle(String(r.productId))}
              expandedKeys={open}
              renderExpanded={(r) => (
                <BatchKids product={r} branchId={branchId} onOpen={(batchId, zoneId) => setPanel({ batchId, zoneId })} />
              )}
              totals={
                data && data.total > 0
                  ? {
                      expand: "",
                      code: t("ov.total"),
                      total: <b className="font-semibold">{formatQuantity(data.totalQty)}</b>,
                      available: <b className="font-semibold">{formatQuantity(data.availableQty)}</b>,
                      ...(data.costSum ? { costSum: formatMoney(data.costSum) } : {}),
                      saleSum: formatMoney(data.saleSum),
                    }
                  : undefined
              }
              emptyState={
                f.q || hasAnyFilter(f) ? (
                  <NoResultsState onClearFilters={() => (setSearch(""), apply({ ...DEFAULT_OVERVIEW }))} />
                ) : (
                  <EmptyState icon={Boxes} title={t("emptyStock")} description={t("emptyStockHint")} />
                )
              }
              pagination={
                data && data.total > 0
                  ? {
                      page: f.page,
                      pageSize: f.size,
                      pageSizeOptions: [...OVERVIEW_PAGE_SIZES],
                      total: data.total,
                      onPageChange: (n) => apply({ page: n }),
                      onPageSizeChange: (n) => apply({ size: n === 50 || n === 100 ? n : 25 }),
                    }
                  : undefined
              }
            />
          )}
        </>
      )}
      {panel ? <BatchPanel batchId={panel.batchId} zoneId={panel.zoneId} onClose={() => setPanel(null)} /> : null}
    </>
  );
}
