"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Truck } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Spinner } from "@/components/ui/spinner";
import { ErrorState } from "@/components/ui/system-states";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { cn } from "@/lib/cn";
import { formatMoney, formatQuantity } from "@/lib/format";

type TransitRow = components["schemas"]["TransitRow"];

/** Hujjatga havola: OK — ombor koʻchirishlari, FS — filiallararo savdo (`?open=<id>`). */
export function transitHref(r: Pick<TransitRow, "kind" | "docId">): string {
  return r.kind === "FS" ? `/branch-sales?open=${r.docId}` : `/warehouse-transfers?open=${r.docId}`;
}

/** Filial kodi bir xil boʻlsa — faqat ombor nomi, aks holda «ombor · KOD». */
export function transitRoute(r: Pick<TransitRow, "fromBranch" | "fromWarehouse" | "toBranch" | "toWarehouse">): string {
  const same = r.fromBranch === r.toBranch;
  const side = (wh: string, br: string) => (same ? wh : `${wh} · ${br}`);
  return `${side(r.fromWarehouse, r.fromBranch)} → ${side(r.toWarehouse, r.toBranch)}`;
}

/**
 * «Yoʻldagi tovar» (prototip `Stock` → «Yoʻlda» kartasi bosilganda): joʻnatilgan, qabul qilinmagan OK/FS qatorlari
 * va qabulda yetishmagan, hal qilinmagan miqdorlar. Tannarx — faqat ruxsat boʻlsa (server yubormaydi).
 */
export function StockTransit({ branchId }: { branchId: number | null }) {
  const t = useTranslations("stock");
  const list = useQuery({
    queryKey: ["stock", "transit", branchId],
    queryFn: () => unwrap(api.GET("/api/stock/transit", { params: { query: { branchId: branchId ?? undefined } } })),
  });
  if (list.isPending)
    return (
      <div className="flex justify-center rounded-card border border-border bg-surface p-8">
        <Spinner />
      </div>
    );
  if (list.error) return <ErrorState onRetry={() => list.refetch()} />;
  const rows = list.data ?? [];
  const showCost = rows.some((r) => r.value != null);
  const grid = showCost
    ? "grid-cols-[minmax(200px,1.4fr)_minmax(240px,1.6fr)_100px_150px_170px]"
    : "grid-cols-[minmax(200px,1.4fr)_minmax(240px,1.6fr)_100px_170px]";
  return (
    <div className="overflow-x-auto rounded-card border border-border bg-surface">
      <div className="min-w-[860px] text-[13px] leading-[18px]" role="table" aria-label={t("ov.tr.tTitle")}>
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Truck size={16} strokeWidth={1.5} className="text-info" aria-hidden />
          <span className="text-body font-semibold">{t("ov.tr.tTitle")}</span>
          <span className="text-text-secondary">{rows.length}</span>
          <span className="flex-1" />
          <span className="text-caption text-text-secondary">{t("ov.tr.tDesc")}</span>
        </div>
        <div
          role="row"
          className={cn("grid h-9 items-center border-b border-border bg-table-header text-caption font-medium text-text-secondary", grid)}
        >
          <span role="columnheader" className="px-4">
            {t("product")}
          </span>
          <span role="columnheader" className="px-3">
            {t("ov.tr.tRoute")}
          </span>
          <span role="columnheader" className="px-3 text-right">
            {t("qty")}
          </span>
          {showCost ? (
            <span role="columnheader" className="px-3 text-right">
              {t("ov.tr.tValue")}
            </span>
          ) : null}
          <span role="columnheader" className="px-3">
            {t("ov.tr.tDoc")}
          </span>
        </div>
        {rows.map((r) => (
          <div
            key={`${r.kind}-${r.docId}-${r.batchNumber}-${r.shortage ? "s" : "t"}`}
            role="row"
            className={cn("grid min-h-[52px] items-center border-b border-border", grid)}
          >
            <span role="cell" className="flex min-w-0 flex-col px-4 py-1.5">
              <span className="truncate font-medium">{r.productName}</span>
              <span className="font-mono text-caption text-text-secondary">{r.batchNumber}</span>
            </span>
            <span role="cell" className="flex min-w-0 flex-col px-3 py-1.5">
              <span>{transitRoute(r)}</span>
              {r.shortage ? <span className="text-caption text-warning">{t("ov.tr.tShort")}</span> : null}
            </span>
            <span role="cell" className={cn("px-3 text-right font-semibold tabular-nums", r.shortage ? "text-warning" : "")}>
              {formatQuantity(r.qty)}
            </span>
            {showCost ? (
              <span role="cell" className="px-3 text-right text-text-secondary tabular-nums">
                {r.value ? formatMoney(r.value) : "—"}
              </span>
            ) : null}
            <span role="cell" className="px-3">
              <Link
                href={transitHref(r)}
                title={r.kind === "FS" ? t("ov.tr.tFs") : t("ov.tr.tOk")}
                className="inline-flex items-center gap-1 font-mono text-[12.5px] text-primary hover:underline"
              >
                {r.number}
                <ArrowUpRight size={14} strokeWidth={1.5} aria-hidden />
              </Link>
            </span>
          </div>
        ))}
        {rows.length === 0 ? <div className="px-4 py-8 text-center text-text-secondary">{t("ov.tr.tNone")}</div> : null}
      </div>
    </div>
  );
}
