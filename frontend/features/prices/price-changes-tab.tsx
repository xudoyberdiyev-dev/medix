"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowUpRight, FilePen } from "lucide-react";
import { useRef, useState } from "react";
import { DateChip, MultiFilter, tashkentDay } from "@/components/ui/multi-filter";
import { EmptyState, ErrorState, NoResultsState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { TextField } from "@/components/ui/text-field";
import { cn } from "@/lib/cn";
import { formatDate, formatQuantity } from "@/lib/format";
import {
  CHANGE_VIEWS,
  isFiltered,
  isFuture,
  PRICE_CHANGE_PAGE_SIZE,
  usePriceChanges,
  type PriceChangeListFilter,
  type PriceChangeStatus,
  type PriceChangeSummary,
} from "./api";
import { StatusBadge } from "./prices-page";

const EMPTY: PriceChangeListFilter = { status: null, q: "", priceTypeIds: [], from: null, to: null, page: 1 };

const day = (iso: string) => formatDate(new Date(`${iso}T00:00:00+05:00`));

/**
 * «Narx oʻzgarishlari» (prototip `Prices` → changes): holat yorliqlari soni bilan, qidiruv (raqam, izoh, mahsulot — lotin/kirill),
 * «Narx turi» chipi, «Hujjat sanasi» oraligʻi; jadval — №, Hujjat sanasi, Kuchga kirish, Narx turi, Filial, Qatorlar, Manba
 * (Kirim boʻyicha · KR havola / Qoʻlda kiritish), Kim, Holat, Izoh; 25 tadan sahifa.
 */
export function PriceChangesTab({ branchId, onOpen }: { branchId: number | null; onOpen: (id: number) => void }) {
  const t = useTranslations("prices.documents");
  const tp = useTranslations("prices");
  const [f, setF] = useState<PriceChangeListFilter>(EMPTY);
  const [search, setSearch] = useState("");
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);
  const docs = usePriceChanges(branchId, f);
  const data = docs.data;
  const apply = (x: Partial<PriceChangeListFilter>) => setF((o) => ({ ...o, ...x, page: x.page ?? 1 }));
  const clearAll = () => {
    setSearch("");
    setF(EMPTY);
  };
  const [today] = useState(() => tashkentDay(Date.now()));

  const counts = new Map((data?.statusCounts ?? []).map((c) => [c.status, c.count]));
  const allCount = [...counts.values()].reduce((a, b) => a + b, 0);
  const views = [
    { key: "ALL", label: t("all"), count: allCount },
    ...CHANGE_VIEWS.filter((s) => s !== "DRAFT" || (counts.get(s) ?? 0) > 0 || f.status === s).map((s) => ({
      key: s,
      label: tp(`status.${s}`),
      count: counts.get(s) ?? 0,
    })),
  ];
  const typeOptions = (data?.priceTypes ?? []).map((x) => ({ value: x.id, label: x.name, count: x.count }));
  for (const id of f.priceTypeIds) if (!typeOptions.some((o) => o.value === id)) typeOptions.push({ value: id, label: `#${id}`, count: 0 });

  const columns: TableColumn<PriceChangeSummary>[] = [
    { key: "number", title: t("no"), mono: true, width: 150 },
    {
      key: "createdAt",
      title: t("createdAt"),
      width: 120,
      render: (d) => <span className="text-text-secondary">{formatDate(new Date(d.createdAt))}</span>,
    },
    {
      key: "effectiveFrom",
      title: t("effectiveFrom"),
      width: 116,
      render: (d) => (
        <span className={cn(isFuture(d.effectiveFrom, today) ? "font-semibold text-info" : "text-text-secondary")}>
          {day(d.effectiveFrom)}
        </span>
      ),
    },
    { key: "priceTypes", title: t("priceType"), wrap: true, render: (d) => (d.priceTypes.length ? d.priceTypes.join(", ") : "—") },
    { key: "branchName", title: t("branch"), width: 130, render: (d) => <span className="text-text-secondary">{d.branchName}</span> },
    { key: "lines", title: t("lines"), align: "right", width: 84, render: (d) => formatQuantity(d.lines) },
    {
      key: "source",
      title: t("source"),
      width: 160,
      render: (d) =>
        d.receiptNumber && d.receiptId ? (
          <Link href={`/receipts/${d.receiptId}`} onClick={(e) => e.stopPropagation()} className="text-primary hover:underline">
            {t("byReceipt", { number: d.receiptNumber })}
          </Link>
        ) : (
          <span className="text-text-secondary">{t("srcManual")}</span>
        ),
    },
    { key: "createdBy", title: t("who"), width: 150, render: (d) => <span className="text-text-secondary">{d.createdBy}</span> },
    { key: "status", title: t("status"), width: 170, render: (d) => <StatusBadge status={d.status} /> },
    { key: "note", title: t("note"), wrap: true, render: (d) => <span className="text-text-secondary">{d.note || "—"}</span> },
    {
      key: "open",
      title: t("open"),
      width: 48,
      render: (d) => (
        <button
          type="button"
          aria-label={t("open")}
          title={t("open")}
          onClick={(e) => {
            e.stopPropagation();
            onOpen(d.id);
          }}
          className="inline-flex size-7 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
        >
          <ArrowUpRight className="size-4" strokeWidth={1.5} aria-hidden />
        </button>
      ),
    },
  ];

  if (docs.error) return <ErrorState onRetry={() => docs.refetch()} />;
  return (
    <>
      <div className="mb-3">
        <Tabs
          aria-label={t("viewsLabel")}
          items={views}
          value={f.status ?? "ALL"}
          onChange={(k) => apply({ status: k === "ALL" ? null : (k as PriceChangeStatus) })}
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
              clearTimeout(debounce.current);
              debounce.current = setTimeout(() => apply({ q: v.trim() }), 300);
            }}
            placeholder={t("searchPlaceholder")}
            className="[&>label]:sr-only"
          />
        </div>
        <MultiFilter label={t("priceType")} options={typeOptions} selected={f.priceTypeIds} onChange={(v) => apply({ priceTypeIds: v })} />
        <DateChip label={t("fDate")} from={f.from} to={f.to} invalid={t("dateInvalid")} onChange={(from, to) => apply({ from, to })} />
        {isFiltered(f) ? (
          <button
            type="button"
            onClick={clearAll}
            className="h-control-sm px-1.5 text-[13px] font-medium text-primary-button hover:underline"
          >
            {t("clearFilters")}
          </button>
        ) : null}
      </div>
      <Table
        caption={t("caption")}
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(d) => String(d.id)}
        loading={docs.isPending}
        onRowClick={(d) => onOpen(d.id)}
        emptyState={
          isFiltered(f) || f.status ? (
            <NoResultsState onClearFilters={clearAll} />
          ) : (
            <EmptyState icon={FilePen} title={t("emptyTitle")} description={t("emptyDescription")} />
          )
        }
        pagination={
          data && data.total > PRICE_CHANGE_PAGE_SIZE
            ? {
                page: f.page,
                pageSize: PRICE_CHANGE_PAGE_SIZE,
                total: data.total,
                onPageChange: (page) => apply({ page }),
                onPageSizeChange: () => undefined,
                pageSizeOptions: [PRICE_CHANGE_PAGE_SIZE],
              }
            : undefined
        }
      />
    </>
  );
}
