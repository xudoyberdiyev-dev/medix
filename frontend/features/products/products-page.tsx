"use client";

import { CircleCheck, CirclePause, Columns3, FileDown, FileUp, FilterX, Pill, Plus, QrCode, ShieldAlert, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { SavedViews } from "@/components/ui/saved-views";
import { Checkbox } from "@/components/ui/selection-controls";
import { EmptyState, ErrorState, NoResultsState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { TextField } from "@/components/ui/text-field";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { useDictionary } from "@/features/dictionaries/api";
import { formatQuantity } from "@/lib/format";
import { PRODUCT_CREATE, useProducts, type ProductRow } from "./api";
import { ImportDialog } from "./import-dialog";
import { ProductDrawer } from "./product-drawer";
import { DEFAULT_FILTERS, activeFilterCount, exportQuery, parseFilters, serializeFilters, type ProductFilters } from "./url-state";

const COLUMN_STORAGE = "medix-products-columns";

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Faol" },
  { value: "INACTIVE", label: "Nofaol" },
  { value: "ALL", label: "Hammasi" },
];
const FLAG_OPTIONS = [
  { value: "marked", label: "Markirovkali" },
  { value: "controlled", label: "Nazoratdagi" },
];

function useHiddenColumns() {
  const [hidden, setHidden] = useState<string[]>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLUMN_STORAGE);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- brauzer xotirasidan bir marta oʻqiladi
      if (raw) setHidden(JSON.parse(raw) as string[]);
    } catch {
      /* xotira yopiq — standart ustunlar */
    }
  }, []);
  const update = (next: string[]) => {
    setHidden(next);
    try {
      localStorage.setItem(COLUMN_STORAGE, JSON.stringify(next));
    } catch {
      /* saqlanmasa ham ishlaydi */
    }
  };
  return [hidden, update] as const;
}

export function ProductsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const filters = parseFilters(new URLSearchParams(params.toString()));
  const me = useMe();
  const canEdit = can(me.data, PRODUCT_CREATE);
  const products = useProducts(filters);
  const manufacturers = useDictionary("MANUFACTURER");
  const categories = useDictionary("CATEGORY");
  const [hidden, setHidden] = useHiddenColumns();
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [open, setOpen] = useState<number | "new" | null>(null);
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState(filters.q);
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);

  const apply = (patch: Partial<ProductFilters>, resetPage = true) => {
    const next = { ...filters, ...patch, ...(resetPage && !("page" in patch) ? { page: 1 } : {}) };
    const qs = serializeFilters(next);
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const onSearch = (v: string) => {
    setSearch(v);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => apply({ q: v }), 300);
  };

  const allColumns: TableColumn<ProductRow>[] = [
    { key: "code", title: "Kod", mono: true, sortable: true, width: 110 },
    {
      key: "name",
      title: "Mahsulot",
      sortable: true,
      render: (p) => (
        <span className="flex items-center gap-2">
          <span>{p.name}</span>
          {p.marked ? (
            <span title="Markirovkali">
              <QrCode size={16} strokeWidth={1.5} aria-label="Markirovkali" className="text-text-secondary" />
            </span>
          ) : null}
          {p.controlled ? (
            <span title="Nazoratdagi">
              <ShieldAlert size={16} strokeWidth={1.5} aria-label="Nazoratdagi" className="text-warning" />
            </span>
          ) : null}
        </span>
      ),
    },
    { key: "manufacturer", title: "Ishlab chiqaruvchi", sortable: true },
    { key: "category", title: "Kategoriya" },
    { key: "country", title: "Davlat" },
    { key: "unit", title: "Birlik" },
    { key: "vatRate", title: "QQS", align: "right", render: (p) => `${p.vatRate.replace(/\.00$/, "")}%` },
    {
      key: "minMax",
      title: "Min / max",
      align: "right",
      render: (p) =>
        p.minQty || p.maxQty ? `${p.minQty ? formatQuantity(p.minQty) : "—"} / ${p.maxQty ? formatQuantity(p.maxQty) : "—"}` : "",
    },
    {
      key: "active",
      title: "Holat",
      render: (p) =>
        p.active ? (
          <Badge tone="success" icon={CircleCheck}>
            Faol
          </Badge>
        ) : (
          <Badge tone="neutral" icon={CirclePause}>
            Nofaol
          </Badge>
        ),
    },
  ];
  const ALWAYS = ["code", "name"];
  const columns = allColumns.filter((c) => ALWAYS.includes(c.key) || !hidden.includes(c.key));

  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (filters.manufacturerId) {
    const name = manufacturers.data?.find((m) => m.id === filters.manufacturerId)?.name ?? "…";
    chips.push({ key: "m", label: `Ishlab chiqaruvchi: ${name}`, clear: () => apply({ manufacturerId: null }) });
  }
  if (filters.categoryId) {
    const name = categories.data?.find((m) => m.id === filters.categoryId)?.name ?? "…";
    chips.push({ key: "c", label: `Kategoriya: ${name}`, clear: () => apply({ categoryId: null }) });
  }
  if (filters.status !== "ACTIVE")
    chips.push({
      key: "s",
      label: `Holat: ${STATUS_OPTIONS.find((s) => s.value === filters.status)?.label}`,
      clear: () => apply({ status: "ACTIVE" }),
    });
  if (filters.flag)
    chips.push({ key: "f", label: FLAG_OPTIONS.find((o) => o.value === filters.flag)?.label ?? "", clear: () => apply({ flag: null }) });

  const filtered = Boolean(filters.q) || activeFilterCount(filters) > 0;
  const data = products.data;

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <h1 className="text-page-title">Mahsulotlar</h1>
          {data ? <span className="text-text-secondary">{formatQuantity(data.total)} ta</span> : null}
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/api/products/export?${exportQuery(filters)}`}
            download
            className="inline-flex h-control-md items-center gap-2 rounded-control border border-border bg-surface px-4 font-medium hover:bg-background"
          >
            <FileDown size={16} strokeWidth={1.5} aria-hidden />
            Excelʼga yuklash
          </a>
          {canEdit ? (
            <>
              <Button variant="secondary" icon={FileUp} onClick={() => setImporting(true)}>
                Import
              </Button>
              <Button icon={Plus} onClick={() => setOpen("new")}>
                Mahsulot qoʻshish
              </Button>
            </>
          ) : null}
        </div>
      </div>
      {products.error ? (
        <ErrorState onRetry={() => products.refetch()} />
      ) : (
        <Table
          caption="Mahsulotlar"
          columns={columns}
          rows={data?.items ?? []}
          rowKey={(p) => String(p.id)}
          loading={products.isPending}
          activeKey={typeof open === "number" ? String(open) : undefined}
          onRowClick={(p) => setOpen(p.id)}
          sort={{
            key: filters.sort === "CODE" ? "code" : filters.sort === "MANUFACTURER" ? "manufacturer" : "name",
            dir: filters.desc ? "desc" : "asc",
          }}
          onSortChange={(s) =>
            apply({ sort: s.key === "code" ? "CODE" : s.key === "manufacturer" ? "MANUFACTURER" : "NAME", desc: s.dir === "desc" })
          }
          toolbar={
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="w-80">
                  <TextField
                    label="Qidirish"
                    variant="search"
                    size="sm"
                    value={search}
                    onChange={onSearch}
                    placeholder="Nom, kod, shtrix-kod (lotin yoki kirill)"
                    className="[&>label]:sr-only"
                  />
                </div>
                <div className="w-56">
                  <Select
                    label="Ishlab chiqaruvchi"
                    size="sm"
                    searchable
                    value={filters.manufacturerId ? String(filters.manufacturerId) : null}
                    onChange={(v) => apply({ manufacturerId: v ? Number(v) : null })}
                    placeholder="Ishlab chiqaruvchi"
                    className="[&>span:first-child]:sr-only"
                    options={(manufacturers.data ?? []).map((m) => ({ value: String(m.id), label: m.name }))}
                  />
                </div>
                <div className="w-48">
                  <Select
                    label="Kategoriya"
                    size="sm"
                    searchable
                    value={filters.categoryId ? String(filters.categoryId) : null}
                    onChange={(v) => apply({ categoryId: v ? Number(v) : null })}
                    placeholder="Kategoriya"
                    className="[&>span:first-child]:sr-only"
                    options={(categories.data ?? []).map((m) => ({ value: String(m.id), label: m.name }))}
                  />
                </div>
                <div className="w-40">
                  <Select
                    label="Belgi"
                    size="sm"
                    value={filters.flag}
                    onChange={(v) => apply({ flag: v === "marked" || v === "controlled" ? v : null })}
                    placeholder="Belgi"
                    className="[&>span:first-child]:sr-only"
                    options={FLAG_OPTIONS}
                  />
                </div>
                <div className="w-36">
                  <Select
                    label="Holat"
                    size="sm"
                    value={filters.status}
                    onChange={(v) => apply({ status: v === "INACTIVE" || v === "ALL" ? v : "ACTIVE" })}
                    className="[&>span:first-child]:sr-only"
                    options={STATUS_OPTIONS}
                  />
                </div>
                <div className="ml-auto">
                  <SavedViews
                    storageKey="medix-products-views"
                    query={params.toString()}
                    hidden={hidden}
                    onApply={(v) => {
                      setSearch(parseFilters(new URLSearchParams(v.query)).q);
                      setHidden(v.hidden);
                      router.replace(v.query ? `${pathname}?${v.query}` : pathname, { scroll: false });
                    }}
                  />
                </div>
                <div className="relative">
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={Columns3}
                    onClick={() => setColumnsOpen((o) => !o)}
                    aria-expanded={columnsOpen}
                  >
                    Ustunlar
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
              {chips.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  {chips.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      onClick={c.clear}
                      className="flex h-7 items-center gap-1 rounded-full border border-border bg-primary-soft px-3 text-caption hover:border-text-disabled"
                    >
                      {c.label}
                      <X size={14} strokeWidth={1.5} aria-label="Olib tashlash" />
                    </button>
                  ))}
                  <Button
                    variant="tertiary"
                    size="sm"
                    icon={FilterX}
                    onClick={() => (
                      setSearch(""),
                      apply({ ...DEFAULT_FILTERS, sort: filters.sort, desc: filters.desc, size: filters.size })
                    )}
                  >
                    Filtrlarni tozalash
                  </Button>
                </div>
              ) : null}
            </div>
          }
          emptyState={
            filtered ? (
              <NoResultsState onClearFilters={() => (setSearch(""), apply({ ...DEFAULT_FILTERS }))} />
            ) : (
              <EmptyState
                icon={Pill}
                title="Hali mahsulot yoʻq"
                description="Mahsulotlarni qoʻlda qoʻshing yoki SmartUp'dan import qiling (keyingi bosqich)."
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
      {importing ? <ImportDialog onClose={() => setImporting(false)} /> : null}
      {open !== null ? (
        <ProductDrawer
          productId={open === "new" ? null : open}
          canEdit={canEdit}
          onClose={() => setOpen(null)}
          onCreated={(id) => setOpen(id)}
        />
      ) : null}
    </>
  );
}
