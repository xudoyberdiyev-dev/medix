"use client";

import { ArrowLeft, CircleCheck, CircleHelp, Download, Link2, TrendingDown, TrendingUp, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Select, type SelectOption } from "@/components/ui/select";
import { EmptyState, ErrorState, ForbiddenState, NoResultsState, Skeleton } from "@/components/ui/system-states";
import { Table, type SortState, type TableColumn } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { usePriceTypes } from "@/features/counterparties/api";
import { describeError } from "@/features/setup/form-error";
import { api, unwrap } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import {
  PRICES_REFERENCE,
  SPECIAL_COST,
  exportUrl,
  useMatchRow,
  useRefCompare,
  type CompareMode,
  type CompareParams,
  type RefCompareRow,
  type RefStatus,
} from "./api";
import { visibleRows, type RefTab } from "./model";

const TONE: Record<RefStatus, "danger" | "warning" | "success" | "neutral"> = {
  EXPENSIVE: "danger",
  CHEAP: "warning",
  MATCH: "success",
  NOT_FOUND: "neutral",
};
const ICON = { EXPENSIVE: TrendingUp, CHEAP: TrendingDown, MATCH: CircleCheck, NOT_FOUND: CircleHelp } as const;

async function searchProducts(q: string): Promise<SelectOption[]> {
  const r = await unwrap(api.GET("/api/products", { params: { query: { q, size: 20 } } }));
  return r.items.map((p) => ({ value: String(p.id), label: p.name, sub: [p.code, p.manufacturer].filter(Boolean).join(" · ") }));
}

/** O14: solishtirish natijasi — 4 yorliq (+ «Tekshiring»), qidiruv, farq % boʻyicha saralash, qoʻlda moslash, Excel. */
export function RefComparePage({ id, initialMode, receiptId }: { id: number; initialMode: CompareMode; receiptId?: number }) {
  const t = useTranslations("referencePrices");
  const me = useMe();
  const costOk = can(me.data, SPECIAL_COST);
  const [mode, setMode] = useState<CompareMode>(initialMode === "RECEIPT" && !costOk && me.data ? "SALE" : initialMode);
  const [priceTypeId, setPriceTypeId] = useState<number | undefined>(undefined);
  const [tab, setTab] = useState<RefTab>("EXPENSIVE");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState>({ key: "pct", dir: "desc" });
  const [matching, setMatching] = useState<RefCompareRow | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const types = usePriceTypes();
  const params: CompareParams = mode === "SALE" ? { mode, priceTypeId } : { mode, receiptId };
  const allowed = can(me.data, PRICES_REFERENCE);
  const res = useRefCompare(id, params, allowed && !!me.data);
  const match = useMatchRow(id);
  if (me.data && !allowed) return <ForbiddenState />;
  if (res.error) return <ErrorState error={res.error} onRetry={() => res.refetch()} />;
  const d = res.data;
  const c = d?.counts;
  const rows = d ? visibleRows(d.rows, tab, query, sort.dir) : [];
  const exportStatus = tab === "CHECK" ? undefined : tab;

  const columns: TableColumn<RefCompareRow>[] = [
    {
      key: "no",
      title: "№",
      width: 60,
      align: "right",
      render: (r) => <span className="text-text-secondary tabular-nums">{r.rowNo}</span>,
    },
    {
      key: "file",
      title: t("cRefName"),
      render: (r) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate">{r.name}</span>
          {r.manufacturer || r.barcode ? (
            <span className="truncate text-caption text-text-secondary">{[r.manufacturer, r.barcode].filter(Boolean).join(" · ")}</span>
          ) : null}
        </span>
      ),
    },
    {
      key: "product",
      title: t("cProduct"),
      render: (r) =>
        r.product ? (
          <span className="flex min-w-0 flex-col">
            <span className="flex items-center gap-2">
              <span className="truncate font-medium">{r.product.name}</span>
              {r.needsCheck ? (
                <Badge tone="warning" icon={TriangleAlert}>
                  {t("needsCheck")}
                </Badge>
              ) : null}
            </span>
            <span className="truncate text-caption text-text-secondary">
              {[r.product.code, r.product.manufacturer, t(`kind.${r.matchKind}`)].filter(Boolean).join(" · ")}
            </span>
          </span>
        ) : (
          <span className="text-text-secondary">{t("notMatched")}</span>
        ),
    },
    {
      key: "ours",
      title: mode === "SALE" ? t("cOurSale") : t("cOurReceipt"),
      align: "right",
      width: 140,
      render: (r) => (r.ourPrice ? formatMoney(r.ourPrice) : "—"),
    },
    { key: "ref", title: t("cRef"), align: "right", width: 140, render: (r) => formatMoney(r.refPrice) },
    {
      key: "diff",
      title: t("cDiff"),
      align: "right",
      width: 140,
      render: (r) => (r.diff ? <span className={cn(Number(r.diff) > 0 && "text-danger")}>{formatMoney(r.diff)}</span> : "—"),
    },
    {
      key: "pct",
      title: t("cPct"),
      align: "right",
      width: 110,
      sortable: true,
      render: (r) =>
        r.diffPct ? (
          <Badge tone={TONE[r.status]} icon={ICON[r.status]}>
            {`${Number(r.diffPct) > 0 ? "+" : ""}${r.diffPct.replace(".", ",")}%`}
          </Badge>
        ) : (
          "—"
        ),
    },
    { key: "source", title: t("cSource"), width: 160, render: (r) => r.source ?? "—" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/reference-prices"
        className="inline-flex items-center gap-1.5 self-start text-table text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft size={16} strokeWidth={1.5} aria-hidden />
        {t("title")}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-title">{d?.fileName ?? t("title")}</h1>
          <p className="mt-1 text-table text-text-secondary">
            {d ? t("tolerance", { p: d.tolerancePct }) : null}
            {d?.receiptNumber ? ` · ${t("receiptN", { n: d.receiptNumber })}` : null}
          </p>
        </div>
        <a
          href={exportUrl(id, params, exportStatus)}
          className="inline-flex h-control-md items-center gap-2 rounded-control border border-border px-4 font-medium hover:bg-background"
        >
          <Download size={16} strokeWidth={1.5} aria-hidden />
          {t("export")}
        </a>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div role="radiogroup" aria-label={t("compareWith")} className="inline-flex h-[34px] gap-0.5 rounded-control bg-border/60 p-0.5">
          {(["SALE", "RECEIPT"] as const)
            .filter((m) => m === "SALE" || costOk)
            .map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                onClick={() => setMode(m)}
                className={cn(
                  "h-[30px] rounded-control px-3.5 font-medium transition-colors duration-150",
                  mode === m ? "bg-surface text-text-primary shadow-xs" : "text-text-secondary",
                )}
              >
                {t(`mode.${m}`)}
              </button>
            ))}
        </div>
        {mode === "SALE" ? (
          <Select
            className="w-64"
            size="sm"
            label={t("priceType")}
            value={priceTypeId ? String(priceTypeId) : String(d?.priceTypeId ?? "")}
            options={(types.data ?? []).map((p) => ({ value: String(p.id), label: p.name }))}
            onChange={(v) => setPriceTypeId(v ? Number(v) : undefined)}
          />
        ) : null}
        <TextField
          className="w-72"
          size="sm"
          variant="search"
          label={t("search")}
          value={query}
          onChange={setQuery}
          placeholder={t("searchPh")}
        />
      </div>
      {!d || !c ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          <Tabs
            aria-label={t("tabs")}
            value={tab}
            onChange={(k) => setTab(k as RefTab)}
            items={[
              { key: "EXPENSIVE", label: t("st.EXPENSIVE"), count: c.expensive },
              { key: "CHEAP", label: t("st.CHEAP"), count: c.cheap },
              { key: "MATCH", label: t("st.MATCH"), count: c.match },
              { key: "NOT_FOUND", label: t("st.NOT_FOUND"), count: c.notFound },
              { key: "CHECK", label: t("st.CHECK"), count: c.needsCheck },
            ]}
          />
          <Table
            caption={t(`st.${tab}`)}
            columns={columns}
            rows={rows}
            rowKey={(r) => String(r.rowId)}
            sort={sort}
            onSortChange={setSort}
            rowActions={(r) => (
              <Button
                size="sm"
                variant="tertiary"
                icon={Link2}
                onClick={() => (setMatching(r), setPick(r.product ? String(r.product.id) : null))}
              >
                {t("match")}
              </Button>
            )}
            emptyState={
              query ? (
                <NoResultsState onClearFilters={() => setQuery("")} />
              ) : (
                <EmptyState icon={CircleCheck} title={t("emptyTab")} description={t("sub")} />
              )
            }
          />
        </>
      )}
      <Modal
        open={matching !== null}
        onClose={() => setMatching(null)}
        title={t("matchTitle")}
        primaryAction={{
          label: t("matchSave"),
          loading: match.isPending,
          onClick: () =>
            matching &&
            match.mutate(
              { rowId: matching.rowId, productId: pick ? Number(pick) : null },
              {
                onSuccess: () => (toast({ tone: "success", title: t("matched") }), setMatching(null)),
                onError: (x) => toast({ tone: "danger", title: describeError(x).message ?? t("eMatch") }),
              },
            ),
        }}
      >
        {matching ? (
          <div className="flex flex-col gap-3">
            <div className="rounded-control bg-table-header px-3 py-2">
              <div className="font-medium">{matching.name}</div>
              <div className="text-caption text-text-secondary">
                {t("refPrice")}: {formatMoney(matching.refPrice)}
              </div>
            </div>
            <Select
              label={t("cProduct")}
              searchable
              value={pick}
              options={
                matching.product ? [{ value: String(matching.product.id), label: matching.product.name, sub: matching.product.code }] : []
              }
              loadOptions={searchProducts}
              onChange={setPick}
              hint={t("matchHint")}
            />
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
