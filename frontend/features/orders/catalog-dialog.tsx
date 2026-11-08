"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, Lock, ScanBarcode, ToggleLeft, ToggleRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { MultiFilter, type FilterOption } from "@/components/ui/multi-filter";
import { ErrorState, Skeleton } from "@/components/ui/system-states";
import { TextField } from "@/components/ui/text-field";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { formatMoney, formatQuantity } from "@/lib/format";
import { cents, fromCents } from "./order-card";
import { day } from "./orders-page";

type CatalogRow = components["schemas"]["CatalogRow"];
type CatalogFacet = components["schemas"]["CatalogFacet"];
type Flag = "MARKED" | "CONTROLLED" | "PRESCRIPTION";
const FLAGS: Flag[] = ["MARKED", "CONTROLLED", "PRESCRIPTION"];

/** Variantlar: qidiruv natijasidagilar + tanlangan, lekin hozir roʻyxatda yoʻqlari (nomi eslab qolingan). */
function facetOptions(facets: CatalogFacet[] | undefined, selected: number[], names: ReadonlyMap<number, string>): FilterOption<number>[] {
  const out: FilterOption<number>[] = (facets ?? []).map((f) => ({ value: f.id, label: f.name, count: f.count }));
  for (const id of selected) if (!out.some((o) => o.value === id)) out.push({ value: id, label: names.get(id) ?? String(id), count: 0 });
  return out;
}

export interface PickedLine {
  productId: number;
  productCode: string;
  productName: string;
  qty: string;
}

/**
 * «Mahsulot qoʻshish» katalogi — toʻliq sahifa koʻrinishi (prototip `ProductPicker`, SPEC 5.3): mijoz shartlari kartasi, qidiruv,
 * «Faqat bor mahsulotlar» (standart yoqilgan), jadval: kod, mahsulot, ishlab chiqaruvchi, mavjud qoldiq, narx (QQS bilan),
 * eng yaqin muddat, min/max, miqdor. Pastda: tanlangan soni va summasi, «Qoʻshish va qaytish» (Ctrl+Enter); Esc — hujjatga qaytish.
 */
export function CatalogView({
  warehouseId,
  customerId,
  title,
  facts,
  onClose,
  onAdd,
}: {
  warehouseId: number;
  customerId: number | null;
  /** Sarlavha yonidagi qism: «BY-TSH-000357 · Shifo Farm». */
  title: string;
  facts: { label: string; value: string }[];
  onClose: () => void;
  onAdd: (lines: PickedLine[]) => void;
}) {
  const t = useTranslations("orders");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [inStockOnly, setInStockOnly] = useState(true);
  const [fMaker, setFMaker] = useState<number[]>([]);
  const [fCat, setFCat] = useState<number[]>([]);
  const [fCountry, setFCountry] = useState<number[]>([]);
  const [fFlags, setFFlags] = useState<Flag[]>([]);
  const [names, setNames] = useState<ReadonlyMap<number, string>>(new Map());
  const [qty, setQty] = useState<Record<number, string>>({});
  const [known, setKnown] = useState<Record<number, CatalogRow>>({});
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);
  const catalog = useQuery({
    queryKey: ["orders", "catalog", warehouseId, customerId, q, inStockOnly, fMaker, fCat, fCountry, fFlags],
    queryFn: () =>
      unwrap(
        api.GET("/api/orders/catalog", {
          params: {
            query: {
              warehouseId,
              customerId: customerId ?? undefined,
              q: q || undefined,
              inStockOnly,
              manufacturerIds: fMaker.length ? fMaker : undefined,
              categoryIds: fCat.length ? fCat : undefined,
              countryIds: fCountry.length ? fCountry : undefined,
              flags: fFlags.length ? fFlags : undefined,
              size: 100,
            },
          },
        }),
      ),
    placeholderData: keepPreviousData,
  });
  const rows = catalog.data?.items ?? [];
  const facets = catalog.data?.facets;
  const hasFilters = fMaker.length + fCat.length + fCountry.length + fFlags.length > 0 || search.trim() !== "";
  const remember = (list: CatalogFacet[] | undefined) =>
    setNames((m) => new Map([...m, ...(list ?? []).map((f) => [f.id, f.name] as const)]));
  const clearFilters = () => {
    setFMaker([]);
    setFCat([]);
    setFCountry([]);
    setFFlags([]);
    setSearch("");
    setQ("");
  };
  // Tanlov qidiruv oʻzgarsa ham saqlanadi — tanlangan qatorlar maʼlumoti eslab qolinadi
  const picked = Object.entries(qty)
    .filter(([, v]) => /^\d+$/.test(v) && Number(v) > 0)
    .map(([id, v]) => ({ row: known[Number(id)], qty: v }))
    .filter((x): x is { row: CatalogRow; qty: string } => x.row !== undefined);
  const sum = picked.reduce((n, x) => n + (x.row.price ? cents(x.row.price) * BigInt(x.qty) : 0n), 0n);

  function add() {
    if (!picked.length) return;
    onAdd(picked.map((x) => ({ productId: x.row.productId, productCode: x.row.code, productName: x.row.name, qty: x.qty })));
  }
  const addRef = useRef(add);
  const closeRef = useRef(onClose);
  useEffect(() => {
    addRef.current = add;
    closeRef.current = onClose;
  });
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        addRef.current();
      } else if (e.key === "Escape" && !document.querySelector("dialog[open], [role='listbox']")) {
        closeRef.current();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  return (
    <div className="flex min-h-[calc(100dvh-104px)] flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-[22px] leading-7 font-semibold tracking-[-0.01em]">{t("catalog.title")}</span>
          <span className="text-body text-text-secondary">{title}</span>
        </h1>
        <Button variant="secondary" icon={ArrowLeft} onClick={onClose}>
          {t("catalog.back")}
        </Button>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 rounded-card border border-border bg-surface px-4 py-4 shadow-sm md:grid-cols-5">
        {facts.map((f) => (
          <div key={f.label} className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-caption text-text-secondary">{f.label}</dt>
            <dd className="font-medium [overflow-wrap:anywhere]">{f.value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap items-center gap-3">
        <TextField
          label={t("catalog.search")}
          variant="search"
          size="sm"
          value={search}
          autoFocus
          onChange={(v) => {
            setSearch(v);
            clearTimeout(debounce.current);
            debounce.current = setTimeout(() => setQ(v.trim()), 250);
          }}
          placeholder={t("catalog.searchPlaceholder")}
          className="w-80 max-w-full [&>:first-child]:sr-only"
        />
        <MultiFilter
          label={t("catalog.f.manufacturer")}
          searchable
          options={facetOptions(facets?.manufacturers, fMaker, names)}
          selected={fMaker}
          onChange={(v) => (remember(facets?.manufacturers), setFMaker(v))}
        />
        <MultiFilter
          label={t("catalog.f.category")}
          searchable
          options={facetOptions(facets?.categories, fCat, names)}
          selected={fCat}
          onChange={(v) => (remember(facets?.categories), setFCat(v))}
        />
        <MultiFilter
          label={t("catalog.f.country")}
          options={facetOptions(facets?.countries, fCountry, names)}
          selected={fCountry}
          onChange={(v) => (remember(facets?.countries), setFCountry(v))}
        />
        <MultiFilter
          label={t("catalog.f.flags")}
          options={FLAGS.map((f) => ({
            value: f,
            label: t(`catalog.flag.${f}`),
            count: facets ? facets.flags[f === "MARKED" ? "marked" : f === "CONTROLLED" ? "controlled" : "prescription"] : undefined,
          }))}
          selected={fFlags}
          onChange={setFFlags}
        />
        {hasFilters ? (
          <Button variant="tertiary" size="sm" onClick={clearFilters}>
            {t("catalog.clearFilters")}
          </Button>
        ) : null}
        <span className="flex-1" />
        <button
          type="button"
          aria-pressed={inStockOnly}
          onClick={() => setInStockOnly((v) => !v)}
          className={`inline-flex h-control-sm items-center gap-2 rounded-control border px-3 text-caption font-medium transition-colors ${
            inStockOnly ? "border-primary bg-primary-soft text-primary" : "border-border bg-surface text-text-primary hover:bg-background"
          }`}
        >
          {inStockOnly ? <ToggleRight size={16} strokeWidth={1.5} aria-hidden /> : <ToggleLeft size={16} strokeWidth={1.5} aria-hidden />}
          {t("catalog.inStock")}
        </button>
      </div>
      {catalog.error ? (
        <ErrorState onRetry={() => catalog.refetch()} />
      ) : catalog.isPending ? (
        <Skeleton className="h-60 w-full" />
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-surface shadow-sm">
          <table className="w-full min-w-[900px] text-table">
            <thead className="bg-table-header text-left text-caption text-text-secondary">
              <tr>
                <th className="px-3 py-3 font-medium">{t("catalog.col.code")}</th>
                <th className="px-3 py-3 font-medium">{t("catalog.col.product")}</th>
                <th className="px-3 py-3 font-medium">{t("catalog.col.manufacturer")}</th>
                <th className="px-3 py-3 text-right font-medium">{t("catalog.col.available")}</th>
                <th className="px-3 py-3 text-right font-medium">{t("catalog.col.price")}</th>
                <th className="px-3 py-3 font-medium">{t("catalog.col.nearestExpiry")}</th>
                <th className="px-3 py-3 text-right font-medium">{t("catalog.col.minMax")}</th>
                <th className="px-3 py-3 text-right font-medium">{t("catalog.col.qty")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-text-secondary">
                    {inStockOnly ? t("catalog.emptyInStock") : t("catalog.empty")}
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const v = qty[r.productId] ?? "";
                  const n = Number(v);
                  const on = /^\d+$/.test(v) && n > 0;
                  const over = on && n > r.available;
                  return (
                    <tr key={r.productId} className={`border-t border-border ${on ? "bg-primary-soft/40" : "hover:bg-background"}`}>
                      <td
                        className={`px-3 py-2.5 font-mono text-text-secondary ${on ? "shadow-[inset_3px_0_0_var(--color-primary)]" : ""}`}
                      >
                        {r.code}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="flex items-center gap-1.5 font-medium">
                          {r.name}
                          {r.controlled ? (
                            <Lock size={13} strokeWidth={1.5} className="text-danger" aria-label={t("catalog.controlled")} />
                          ) : null}
                          {r.marked ? (
                            <ScanBarcode size={13} strokeWidth={1.5} className="text-text-secondary" aria-label={t("catalog.marked")} />
                          ) : null}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-text-secondary">{r.manufacturer ?? "—"}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatQuantity(r.available)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {r.price ? formatMoney(r.price) : <span className="text-text-disabled">{t("catalog.noPrice")}</span>}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums">{r.nearestExpiry ? day(r.nearestExpiry) : "—"}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-text-secondary">
                        {r.minQty ?? "—"} / {r.maxQty ?? "—"}
                      </td>
                      <td className="px-3 py-1 text-right">
                        <TextField
                          label={t("catalog.qtyAria", { name: r.name })}
                          size="sm"
                          value={v}
                          placeholder="0"
                          onChange={(x) => {
                            setKnown((k) => (k[r.productId] ? k : { ...k, [r.productId]: r }));
                            setQty((m) => ({ ...m, [r.productId]: x }));
                          }}
                          onKeyDown={(e) => e.key === "Enter" && !e.ctrlKey && picked.length > 0 && (e.preventDefault(), add())}
                          inputMode="numeric"
                          error={over ? t("catalog.available", { qty: formatQuantity(r.available) }) : undefined}
                          className="ml-auto w-28 [&>:first-child]:sr-only [&_input]:text-right"
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
      <div className="sticky bottom-0 z-20 -mx-6 mt-auto -mb-6 flex flex-wrap items-center justify-end gap-3 border-t border-border bg-surface px-6 py-3 shadow-[0_-4px_12px_rgba(18,60,58,0.06)]">
        <span className="mr-auto flex items-baseline gap-2">
          <span className="font-semibold">{t("catalog.picked", { count: picked.length })}</span>
          <span className="text-text-secondary">· {t("catalog.pickedSum", { amount: formatMoney(fromCents(sum)) })}</span>
        </span>
        <Button variant="secondary" disabled={!picked.length} onClick={() => setQty({})}>
          {t("catalog.clear")}
        </Button>
        <Button icon={Check} disabled={!picked.length} onClick={add} aria-keyshortcuts="Control+Enter">
          {t("catalog.add")}
          <kbd className="ml-1 rounded-sm bg-white/15 px-1.5 font-mono text-[11px] leading-4 font-normal">Ctrl+Enter</kbd>
        </Button>
      </div>
    </div>
  );
}
