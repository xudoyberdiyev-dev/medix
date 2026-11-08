"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Building2, ChevronDown, ChevronRight, Warehouse } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState, ErrorState } from "@/components/ui/system-states";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { cn } from "@/lib/cn";
import { formatMoney, formatQuantity } from "@/lib/format";
import type { ZoneTypeCode } from "./overview-state";
import { ZONE_ICON } from "./zone-icon";

type TreeNode = components["schemas"]["TreeNode"];

const nodeKey = (n: TreeNode) => `${n.branchId}:${n.warehouseId ?? ""}:${n.zoneId ?? ""}`;

/** Koʻrinadigan qatorlar: yigʻilgan filial/ombor ostidagilar yashiriladi. */
export function visibleNodes(nodes: TreeNode[], collapsed: string[]): TreeNode[] {
  return nodes.filter((n) => {
    if (n.level === "BRANCH") return true;
    if (collapsed.includes(`${n.branchId}::`)) return false;
    if (n.level === "ZONE" && collapsed.includes(`${n.branchId}:${n.warehouseId}:`)) return false;
    return true;
  });
}

/**
 * Ombor daraxti (prototip `Stock` → «Ombor daraxti»): filial → ombor → zona, mahsulotlar soni, miqdor, tannarxda summa.
 * Zona bosilsa — «Mahsulot boʻyicha» koʻrinishi shu ombor va zona turi bilan ochiladi.
 */
export function StockTree({
  branchId,
  onPickZone,
}: {
  branchId: number | null;
  onPickZone: (warehouseId: number, zoneType: ZoneTypeCode) => void;
}) {
  const t = useTranslations("stock");
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const tree = useQuery({
    queryKey: ["stock", "tree", branchId],
    queryFn: () => unwrap(api.GET("/api/stock/tree", { params: { query: { branchId: branchId ?? undefined } } })),
  });
  if (tree.isPending)
    return (
      <div className="flex justify-center rounded-card border border-border bg-surface p-8">
        <Spinner />
      </div>
    );
  if (tree.error) return <ErrorState onRetry={() => tree.refetch()} />;
  const nodes = tree.data ?? [];
  if (!nodes.length) return <EmptyState icon={Warehouse} title={t("emptyStock")} description={t("emptyStockHint")} />;
  const showCost = nodes.some((n) => n.value != null);
  const grid = showCost ? "grid-cols-[minmax(0,1fr)_120px_140px_180px]" : "grid-cols-[minmax(0,1fr)_120px_140px]";
  const toggle = (k: string) => setCollapsed((c) => (c.includes(k) ? c.filter((x) => x !== k) : [...c, k]));
  return (
    <div className="overflow-x-auto rounded-card border border-border bg-surface text-[13px]" role="table" aria-label={t("ov.vWh")}>
      <div className="min-w-[640px]">
        <div
          role="row"
          className={cn(
            "grid h-[38px] items-center border-b border-border bg-table-header text-caption font-medium text-text-secondary",
            grid,
          )}
        >
          <span role="columnheader" className="px-4">
            {t("ov.c.tree")}
          </span>
          <span role="columnheader" className="px-3 text-right">
            {t("ov.c.products")}
          </span>
          <span role="columnheader" className="px-3 text-right">
            {t("ov.c.qty")}
          </span>
          {showCost ? (
            <span role="columnheader" className="px-4 text-right">
              {t("ov.c.costSum")}
            </span>
          ) : null}
        </div>
        {visibleNodes(nodes, collapsed).map((n) => {
          const k = nodeKey(n);
          const zone = n.level === "ZONE";
          const open = !collapsed.includes(k);
          const Z = zone && n.zoneType ? ZONE_ICON[n.zoneType] : null;
          const Icon = Z?.icon ?? (n.level === "BRANCH" ? Building2 : Warehouse);
          const label = n.level === "BRANCH" ? n.branch : n.level === "WAREHOUSE" ? n.warehouse : n.zone;
          return (
            <button
              key={k}
              type="button"
              role="row"
              onClick={() => (zone && n.warehouseId != null && n.zoneType ? onPickZone(n.warehouseId, n.zoneType) : toggle(k))}
              aria-expanded={zone ? undefined : open}
              className={cn(
                "grid w-full items-center border-b border-border text-left hover:bg-table-header",
                grid,
                n.level === "BRANCH" ? "h-11 bg-table-header/60" : zone ? "h-10" : "h-11",
              )}
            >
              <span
                role="cell"
                className={cn(
                  "flex min-w-0 items-center gap-2 pr-3",
                  n.level === "BRANCH" ? "pl-4" : n.level === "WAREHOUSE" ? "pl-10" : "pl-[72px]",
                )}
              >
                {!zone ? (
                  open ? (
                    <ChevronDown size={16} strokeWidth={1.5} className="shrink-0 text-text-secondary" aria-hidden />
                  ) : (
                    <ChevronRight size={16} strokeWidth={1.5} className="shrink-0 text-text-secondary" aria-hidden />
                  )
                ) : null}
                <Icon size={16} strokeWidth={1.5} className={cn("shrink-0", Z?.cls ?? "text-text-secondary")} aria-hidden />
                <span className={cn("truncate", zone ? "font-normal" : "font-semibold")}>{label}</span>
                {zone ? <ArrowUpRight size={14} strokeWidth={1.5} className="shrink-0 text-primary" aria-hidden /> : null}
              </span>
              <span role="cell" className="tabular px-3 text-right text-text-secondary">
                {formatQuantity(n.products)}
              </span>
              <span role="cell" className={cn("tabular px-3 text-right", !zone && "font-semibold")}>
                {formatQuantity(n.qty)}
              </span>
              {showCost ? (
                <span role="cell" className="tabular px-4 text-right">
                  {n.value ? formatMoney(n.value) : ""}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
