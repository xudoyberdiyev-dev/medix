"use client";

import {
  ArrowUpRight,
  CircleCheck,
  CircleSlash,
  Copy,
  Download,
  FilterX,
  Lock,
  Package,
  Pencil,
  Plus,
  ScanBarcode,
  Upload,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ColumnsMenu, useColumnPrefs } from "@/components/ui/columns-menu";
import { MultiFilter, type FilterOption } from "@/components/ui/multi-filter";
import { RowMenu, type RowMenuItem } from "@/components/ui/row-menu";
import { EmptyState, ErrorState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { DeactivateDialog } from "@/features/organization/deactivate-dialog";
import { cn } from "@/lib/cn";
import { formatMoney, formatQuantity } from "@/lib/format";
import { useBranchStore } from "@/lib/stores/branch";
import { PRODUCT_CREATE, useActivateProduct, useBulkDeactivate, useProducts, type ProductRow } from "./api";
import {
  DEFAULT_FILTERS,
  PRODUCT_VIEWS,
  activeFilterCount,
  exportQuery,
  parseFilters,
  serializeFilters,
  type ProductFilters,
  type ProductSort,
  type ProductStatusFilter,
} from "./url-state";

/** Prototip `Products` ustunlari (COLS0) tartibida. */
const COLUMN_KEYS = [
  "code",
  "name",
  "contractName",
  "classifierName",
  "manufacturer",
  "country",
  "category",
  "dosageForm",
  "dose",
  "unit",
  "packQty",
  "barcode",
  "ikpu",
  "farmId",
  "supplyEmployee",
  "controlled",
  "marked",
  "prescription",
  "vatRate",
  "minQty",
  "maxQty",
  "stock",
  "price",
  "note",
  "status",
] as const;
type ColumnKey = (typeof COLUMN_KEYS)[number];

const WIDTH: Record<ColumnKey, number> = {
  code: 104,
  name: 250,
  contractName: 260,
  classifierName: 180,
  manufacturer: 150,
  country: 120,
  category: 160,
  dosageForm: 110,
  dose: 100,
  unit: 80,
  packQty: 100,
  barcode: 150,
  ikpu: 170,
  farmId: 130,
  supplyEmployee: 160,
  controlled: 110,
  marked: 110,
  prescription: 100,
  vatRate: 80,
  minQty: 104,
  maxQty: 104,
  stock: 100,
  price: 120,
  note: 220,
  status: 110,
};
const RIGHT: ColumnKey[] = ["packQty", "minQty", "maxQty", "stock", "price"];
const MONO: ColumnKey[] = ["code", "barcode", "ikpu", "farmId"];
const SORT_OF: Partial<Record<ColumnKey, ProductSort>> = {
  code: "CODE",
  name: "NAME",
  contractName: "CONTRACT_NAME",
  manufacturer: "MANUFACTURER",
  category: "CATEGORY",
  country: "COUNTRY",
  vatRate: "VAT",
  minQty: "MIN_QTY",
  maxQty: "MAX_QTY",
  stock: "STOCK",
  price: "PRICE",
};
const MATCH_KEY: Record<string, "code" | "barcode" | "contractName" | "classifierName" | "ikpu" | "farmId"> = {
  CODE: "code",
  BARCODE: "barcode",
  CONTRACT_NAME: "contractName",
  CLASSIFIER_NAME: "classifierName",
  IKPU: "ikpu",
  FARM_ID: "farmId",
};

type Facet = { id: number; name?: string; count: number };
const facetOptions = (facets: Facet[] | undefined, selected: number[]): FilterOption<number>[] => {
  const list = (facets ?? []).map((f) => ({ value: f.id, label: f.name ?? "—", count: f.count }));
  for (const id of selected) if (!list.some((o) => o.value === id)) list.push({ value: id, label: `#${id}`, count: 0 });
  return list;
};

const Dash = () => <span className="text-text-disabled">—</span>;

/** Qidiruvdagi soʻz nomda boʻlsa — ajratib koʻrsatiladi (prototip). */
function Highlight({ text, q }: { text: string; q: string }) {
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-[2px] bg-warning-bg text-inherit">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

/**
 * Mahsulotlar (prototip `Products`): «Mahsulotlar N», Import · «…» (Eksport) · «Mahsulot qoʻshish»; yorliqlar Hammasi / Faol /
 * Nazoratdagi / Markirovkali / Retsept boʻyicha / Nofaol (soni bilan); qidiruv + Ishlab chiqaruvchi / Kategoriya / Davlat /
 * Taʼminot masʼuli / Holat (bir nechta qiymat, soni bilan); «Ustunlar» (koʻrinish va tartib); 25 ustunli jadval, saralash,
 * tanlash → Eksport / Nofaol qilish; qator menyusi Ochish / Tahrirlash / Nusxa olish / Nofaol (Faol) qilish. Filtrlar URL'da.
 */
export function ProductsPage() {
  const t = useTranslations("products.list");
  const tp = useTranslations("products");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const filters = parseFilters(new URLSearchParams(params.toString()));
  const me = useMe();
  const canEdit = can(me.data, PRODUCT_CREATE);
  const selectedBranch = useBranchStore((s) => s.branchId);
  const branchId = me.data?.allBranches ? (selectedBranch ?? null) : null;
  const products = useProducts(filters, branchId);
  const activate = useActivateProduct();
  const bulkDeactivate = useBulkDeactivate();
  const { cols, update: setCols, reset: resetCols } = useColumnPrefs("medix-products-cols", COLUMN_KEYS);
  const [selected, setSelected] = useState<string[]>([]);
  const [deact, setDeact] = useState<number[] | null>(null);
  const [search, setSearch] = useState(filters.q);
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);
  const data = products.data;

  const apply = (patch: Partial<ProductFilters>, resetPage = true) => {
    const next = { ...filters, ...patch, ...(resetPage && !("page" in patch) ? { page: 1 } : {}) };
    const qs = serializeFilters(next);
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const clearFilters = () => apply({ manufacturers: [], categories: [], countries: [], supply: [], statuses: [] });
  const clearAll = () => (setSearch(""), apply({ ...DEFAULT_FILTERS, size: filters.size }));

  const labels = Object.fromEntries(COLUMN_KEYS.map((k) => [k, t(`col.${k}`)])) as Record<ColumnKey, string>;
  const q = filters.q.trim();
  const cell = (p: ProductRow, k: ColumnKey) => {
    switch (k) {
      case "name": {
        const mk = p.match ? MATCH_KEY[p.match.field] : undefined;
        const sub = mk
          ? `${t(`match.${mk}`)}: ${p.match?.value ?? ""}`
          : [p.dosageForm ? tp(`dosageForm.${p.dosageForm}`) : "", p.dose ?? ""].filter(Boolean).join(" ") + ` · №${p.packQty ?? "—"}`;
        return (
          <span className="flex min-w-0 flex-col">
            <span className="flex items-center gap-2">
              <span className={cn("truncate font-medium", p.active ? "" : "text-text-disabled")}>
                <Highlight text={p.name} q={mk ? "" : q} />
              </span>
              {p.active ? null : <Badge tone="neutral">{t("inactive")}</Badge>}
            </span>
            <span className="truncate text-caption text-text-secondary">{sub}</span>
          </span>
        );
      }
      case "dosageForm":
        return p.dosageForm ? tp(`dosageForm.${p.dosageForm}`) : <Dash />;
      case "packQty":
      case "minQty":
        return p[k] ? formatQuantity(p[k]) : <Dash />;
      case "maxQty":
        return p.maxQty ? formatQuantity(p.maxQty) : <span className="text-text-secondary">{tp("unlimited")}</span>;
      case "stock":
        return <span className={p.stock ? "" : "text-text-disabled"}>{formatQuantity(p.stock)}</span>;
      case "price":
        return p.price ? formatMoney(p.price) : <span className="text-text-disabled">{t("noPrice")}</span>;
      case "controlled":
        return p.controlled ? (
          <Badge tone="danger" icon={Lock}>
            {t("stCtrl")}
          </Badge>
        ) : (
          <Dash />
        );
      case "marked":
        return p.marked ? (
          <Badge tone="neutral" icon={ScanBarcode}>
            {t("yes")}
          </Badge>
        ) : (
          <Dash />
        );
      case "prescription":
        return p.prescription ? t("yes") : <Dash />;
      case "vatRate":
        return `${p.vatRate.replace(/\.00$/, "")}%`;
      case "status":
        return p.active ? (
          <Badge tone="success" icon={CircleCheck}>
            {t("active")}
          </Badge>
        ) : (
          <Badge tone="neutral" icon={CircleSlash}>
            {t("inactive")}
          </Badge>
        );
      default: {
        const v = p[k];
        return v === null || v === undefined || v === "" ? <Dash /> : String(v);
      }
    }
  };
  const columns: TableColumn<ProductRow>[] = cols
    .filter((c) => c.visible)
    .map((c) => {
      const k = c.key as ColumnKey;
      return {
        key: k,
        title: labels[k],
        width: WIDTH[k],
        align: RIGHT.includes(k) ? "right" : "left",
        mono: MONO.includes(k),
        sortable: Boolean(SORT_OF[k]),
        // Prototip: Kod va Nom gorizontal aylantirishda chapda qoladi
        pinned: k === "code" || k === "name",
        render: (p: ProductRow) => cell(p, k),
      };
    });
  const sortKey = (Object.entries(SORT_OF).find(([, s]) => s === filters.sort)?.[0] ?? "name") as ColumnKey;

  const views = data?.views;
  const viewCount: Record<string, number | undefined> = {
    ALL: views?.all,
    ACTIVE: views?.active,
    CONTROLLED: views?.controlled,
    MARKED: views?.marked,
    PRESCRIPTION: views?.prescription,
    INACTIVE: views?.inactive,
  };
  const facets = data?.facets;
  const statusOptions: FilterOption<ProductStatusFilter>[] = [
    { value: "ACTIVE", label: t("active"), count: facets?.active },
    { value: "INACTIVE", label: t("inactive"), count: facets?.inactive },
  ];
  const hasFilters = activeFilterCount(filters) > 0;
  const activeNames = [
    q ? `${t("searchWord")} «${q}»` : "",
    filters.manufacturers.length ? t("f.manufacturer") : "",
    filters.categories.length ? t("f.category") : "",
    filters.countries.length ? t("f.country") : "",
    filters.supply.length ? t("f.supply") : "",
    filters.statuses.length ? t("f.status") : "",
  ].filter(Boolean);
  const filtered = activeNames.length > 0 || filters.view !== "ALL";

  const exportHref = (ids: number[] = []) => `/api/products/export?${exportQuery(filters, branchId, ids)}`;
  const selIds = selected.map(Number);
  const rowItems = (p: ProductRow): RowMenuItem[] => [
    {
      key: "open",
      label: t("aOpen"),
      icon: <ArrowUpRight size={16} strokeWidth={1.5} aria-hidden />,
      onSelect: () => router.push(`/products/${p.id}`),
    },
    ...(canEdit
      ? [
          {
            key: "edit",
            label: t("aEdit"),
            icon: <Pencil size={16} strokeWidth={1.5} aria-hidden />,
            onSelect: () => router.push(`/products/${p.id}/edit`),
          },
          {
            key: "copy",
            label: t("aCopy"),
            icon: <Copy size={16} strokeWidth={1.5} aria-hidden />,
            onSelect: () => router.push(`/products/new?copy=${p.id}`),
          },
          p.active
            ? {
                key: "deact",
                label: t("aDeact"),
                icon: <CircleSlash size={16} strokeWidth={1.5} className="text-danger" aria-hidden />,
                onSelect: () => setDeact([p.id]),
              }
            : {
                key: "act",
                label: t("aAct"),
                icon: <CircleCheck size={16} strokeWidth={1.5} aria-hidden />,
                onSelect: () =>
                  activate.mutate(p.id, { onSuccess: () => toast({ tone: "success", title: t("activated", { name: p.name }) }) }),
              },
        ]
      : []),
  ];

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="flex items-baseline gap-2 text-page-title">
          {t("title")}
          {views ? <span className="text-body font-normal text-text-secondary tabular-nums">{formatQuantity(views.all)}</span> : null}
        </h1>
        <div className="flex items-center gap-2">
          {canEdit ? (
            <Button variant="secondary" icon={Upload} onClick={() => router.push("/products/import")}>
              {t("import")}
            </Button>
          ) : null}
          <RowMenu
            label={t("more")}
            items={[
              {
                key: "export",
                label: t("export"),
                icon: <Download size={16} strokeWidth={1.5} aria-hidden />,
                onSelect: () => window.location.assign(exportHref()),
              },
            ]}
          />
          {canEdit ? (
            <Button icon={Plus} onClick={() => router.push("/products/new")}>
              {t("add")}
            </Button>
          ) : null}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <Tabs
          aria-label={t("viewsLabel")}
          items={PRODUCT_VIEWS.map((v) => ({ key: v, label: t(`views.${v}`), count: viewCount[v] }))}
          value={filters.view}
          onChange={(k) => (setSelected([]), apply({ view: k as ProductFilters["view"] }))}
        />
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-80">
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
              placeholder={t("searchPlaceholder")}
              className="[&>label]:sr-only"
            />
          </div>
          <MultiFilter
            label={t("f.manufacturer")}
            searchable
            options={facetOptions(facets?.manufacturers, filters.manufacturers)}
            selected={filters.manufacturers}
            onChange={(v) => apply({ manufacturers: v })}
          />
          <MultiFilter
            label={t("f.category")}
            searchable
            options={facetOptions(facets?.categories, filters.categories)}
            selected={filters.categories}
            onChange={(v) => apply({ categories: v })}
          />
          <MultiFilter
            label={t("f.country")}
            searchable
            options={facetOptions(facets?.countries, filters.countries)}
            selected={filters.countries}
            onChange={(v) => apply({ countries: v })}
          />
          <MultiFilter
            label={t("f.supply")}
            searchable
            options={facetOptions(facets?.supplyEmployees, filters.supply)}
            selected={filters.supply}
            onChange={(v) => apply({ supply: v })}
          />
          <MultiFilter label={t("f.status")} options={statusOptions} selected={filters.statuses} onChange={(v) => apply({ statuses: v })} />
          {hasFilters ? (
            <button
              type="button"
              onClick={clearFilters}
              className="h-control-sm px-1.5 text-[13px] font-medium text-primary-button hover:underline"
            >
              {t("clearFilters")}
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
      </div>
      {products.error ? (
        <ErrorState onRetry={() => products.refetch()} />
      ) : (
        <Table
          caption={t("title")}
          columns={columns}
          rows={data?.items ?? []}
          rowKey={(p) => String(p.id)}
          loading={products.isPending}
          onRowClick={(p) => router.push(`/products/${p.id}`)}
          rowActions={(p) => <RowMenu label={t("actions")} items={rowItems(p)} />}
          selectable
          selectedKeys={selected}
          onSelectionChange={setSelected}
          bulkActions={
            <div className="flex items-center gap-2">
              <span className="font-medium">{t("selected", { count: formatQuantity(selected.length) })}</span>
              <Button variant="secondary" size="sm" icon={Download} onClick={() => window.location.assign(exportHref(selIds))}>
                {t("export")}
              </Button>
              {canEdit ? (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={CircleSlash}
                  onClick={() => {
                    const ids = (data?.items ?? []).filter((p) => p.active && selIds.includes(p.id)).map((p) => p.id);
                    if (ids.length) setDeact(ids);
                  }}
                >
                  {t("aDeact")}
                </Button>
              ) : null}
              <Button variant="tertiary" size="sm" onClick={() => setSelected([])}>
                {t("clearSel")}
              </Button>
            </div>
          }
          sort={{ key: sortKey, dir: filters.desc ? "desc" : "asc" }}
          onSortChange={(s) => apply({ sort: SORT_OF[s.key as ColumnKey] ?? "NAME", desc: s.dir === "desc" })}
          emptyState={
            filtered ? (
              <EmptyState
                icon={FilterX}
                title={t("noResTitle")}
                description={t("noResDescription", { filters: activeNames.join(", ") || t(`views.${filters.view}`) })}
                action={
                  <Button variant="secondary" icon={FilterX} onClick={clearAll}>
                    {t("clearFilters")}
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={Package}
                title={t("emptyTitle")}
                description={t("emptyDescription")}
                action={
                  canEdit ? (
                    <div className="flex items-center gap-2">
                      <Button variant="secondary" icon={Upload} onClick={() => router.push("/products/import")}>
                        {t("importExcel")}
                      </Button>
                      <Button icon={Plus} onClick={() => router.push("/products/new")}>
                        {t("add")}
                      </Button>
                    </div>
                  ) : undefined
                }
              />
            )
          }
          pagination={
            data && data.total > 0
              ? {
                  page: filters.page,
                  pageSize: filters.size,
                  total: data.total,
                  onPageChange: (page) => apply({ page }, false),
                  onPageSizeChange: (size) => apply({ size }),
                }
              : undefined
          }
        />
      )}
      {deact ? (
        <DeactivateDialog
          title={deact.length === 1 ? t("dTitle") : t("dTitleN", { count: formatQuantity(deact.length) })}
          consequence={`${t("dKeep")}. ${t("dNoNew")}.`}
          actionLabel={t("dConfirm")}
          pending={bulkDeactivate.isPending}
          error={bulkDeactivate.error}
          onConfirm={(reason) =>
            bulkDeactivate.mutate(
              { ids: deact, reason },
              {
                onSuccess: (n) => {
                  toast({ tone: "success", title: t("deactivated", { count: formatQuantity(n) }) });
                  setDeact(null);
                  setSelected([]);
                },
              },
            )
          }
          onClose={() => setDeact(null)}
        />
      ) : null}
    </div>
  );
}
