"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AlarmClock, CalendarClock, CircleCheck, CircleX, Download, type LucideIcon, PackageMinus, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, ForbiddenState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { can, canAny } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { useBranchStore } from "@/lib/stores/branch";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { cn } from "@/lib/cn";
import { formatDate, formatMoney, formatQuantity } from "@/lib/format";
import { BatchPanel } from "./batch-panel";

type StockRow = components["schemas"]["StockRow"];
export type ExpiryGroupKey = "EXPIRED" | "D30" | "D90" | "D180";
type Sort = "NAME" | "EXPIRY" | "QTY";

/** Ogohlantirish chegarasi (kun) — sidebar nishoni va server bilan bir xil. */
export const EXPIRY_WARN_DAYS = 90;
const GROUPS: ExpiryGroupKey[] = ["EXPIRED", "D30", "D90", "D180"];
const SORT_COLUMNS: Record<string, Sort> = { productName: "NAME", expiryDate: "EXPIRY", available: "QTY" };

export interface ExpiryFilters {
  group: ExpiryGroupKey | null;
  sort: Sort | null;
  desc: boolean;
  page: number;
  size: 20 | 50 | 100;
}

export function parseExpiry(p: URLSearchParams): ExpiryFilters {
  const page = Number(p.get("page"));
  const size = Number(p.get("size"));
  const sort = Object.values(SORT_COLUMNS).find((x) => x === p.get("sort")) ?? null;
  return {
    group: GROUPS.find((g) => g === p.get("group")) ?? null,
    sort,
    desc: p.get("desc") === "1",
    page: Number.isInteger(page) && page > 1 ? page : 1,
    size: size === 20 || size === 100 ? size : 50,
  };
}

export function serializeExpiry(f: ExpiryFilters): string {
  const p = new URLSearchParams();
  if (f.group) p.set("group", f.group);
  if (f.sort) p.set("sort", f.sort);
  if (f.desc) p.set("desc", "1");
  if (f.page > 1) p.set("page", String(f.page));
  if (f.size !== 50) p.set("size", String(f.size));
  return p.toString();
}

/** Guruh → server filtri: guruhsiz — chegara ichidagilar (oʻtganlar bilan). */
export function groupRange(g: ExpiryGroupKey | null): { expiringWithinDays: number; minDaysLeft?: number } {
  switch (g) {
    case "EXPIRED":
      return { expiringWithinDays: -1 };
    case "D30":
      return { expiringWithinDays: 30, minDaysLeft: 0 };
    case "D90":
      return { expiringWithinDays: EXPIRY_WARN_DAYS, minDaysLeft: 31 };
    case "D180":
      return { expiringWithinDays: 180, minDaysLeft: EXPIRY_WARN_DAYS + 1 };
    default:
      return { expiringWithinDays: EXPIRY_WARN_DAYS };
  }
}

export type TipKey = "expired" | "reserved" | "d30" | "d90" | "watch";
/** Prototip «Tavsiya» ustuni. */
export function expiryTip(r: Pick<StockRow, "daysLeft" | "reserved">): TipKey {
  if (r.daysLeft < 0) return "expired";
  if (r.reserved > 0) return "reserved";
  if (r.daysLeft <= 30) return "d30";
  if (r.daysLeft <= EXPIRY_WARN_DAYS) return "d90";
  return "watch";
}

const META: Record<ExpiryGroupKey, { icon: LucideIcon; color: string }> = {
  EXPIRED: { icon: CircleX, color: "text-danger" },
  D30: { icon: AlarmClock, color: "text-danger" },
  D90: { icon: TriangleAlert, color: "text-warning" },
  D180: { icon: CalendarClock, color: "text-text-secondary" },
};

const day = (iso: string) => formatDate(new Date(`${iso}T00:00:00+05:00`));
const available = (r: StockRow) => (r.sellable && r.daysLeft >= 0 ? r.qty - r.reserved : 0);

/**
 * Muddat nazorati (prototip `ExpiryControl`): chegara izohi, muddati oʻtganlar banneri (hammasini hisobdan chiqarish),
 * 4 guruh kartasi (oʻtgan / 30 kun / 31–90 / 91–180 — soni, miqdor, tannarxda summa; bosilsa filtr), jadval
 * (Mahsulot, Partiya, Filial / Ombor / Zona, Yaroqlilik, Qolgan kun, Mavjud, Band, Tannarxda, Tavsiya), qator → partiya kartasi.
 */
export function ExpiryControl() {
  const t = useTranslations("stock");
  const me = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const branchId = useBranchStore((s) => s.branchId);
  const f = parseExpiry(new URLSearchParams(params.toString()));
  const [panel, setPanel] = useState<{ batchId: number; zoneId: number } | null>(null);
  const apply = (patch: Partial<ExpiryFilters>) => {
    const qs = serializeExpiry({ ...f, page: 1, ...patch });
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const allowed = canAny(me.data, ["expiry.view", "stock.view"]);
  const groups = useQuery({
    queryKey: ["stock", "expiry-groups", branchId],
    queryFn: () => unwrap(api.GET("/api/stock/expiry-groups", { params: { query: { branchId: branchId ?? undefined } } })),
    enabled: allowed,
  });
  const range = groupRange(f.group);
  const list = useQuery({
    queryKey: ["stock", "expiry-list", branchId, f],
    queryFn: () =>
      unwrap(
        api.GET("/api/stock", {
          params: {
            query: {
              branchId: branchId ?? undefined,
              ...range,
              sort: f.sort ?? undefined,
              desc: f.desc || undefined,
              page: f.page - 1,
              size: f.size,
            },
          },
        }),
      ),
    enabled: allowed,
    placeholderData: keepPreviousData,
  });

  if (me.data && !allowed) return <ForbiddenState description={t("forbidden")} />;

  const g = groups.data ?? [];
  const expired = g.find((x) => x.group === "EXPIRED")?.batches ?? 0;
  const showCost = g.some((x) => x.value != null);
  const canWriteOff = can(me.data, "hc.create");
  const rows = list.data?.items ?? [];
  const exportQs = new URLSearchParams();
  if (branchId) exportQs.set("branchId", String(branchId));
  exportQs.set("expiringWithinDays", String(range.expiringWithinDays));
  if (range.minDaysLeft != null) exportQs.set("minDaysLeft", String(range.minDaysLeft));

  const columns: TableColumn<StockRow>[] = [
    {
      key: "productName",
      title: t("product"),
      sortable: true,
      wrap: true,
      render: (r) => (
        <span className="flex flex-col">
          <span className="font-medium">{r.productName}</span>
          {r.manufacturer ? <span className="text-caption text-text-secondary">{r.manufacturer}</span> : null}
        </span>
      ),
    },
    { key: "batchNumber", title: t("batch"), mono: true, width: 120 },
    {
      key: "loc",
      title: t("ex.cLoc"),
      render: (r) => (
        <span className="flex flex-col">
          <span>{r.warehouse}</span>
          <span className="text-caption text-text-secondary">{r.zone}</span>
        </span>
      ),
    },
    { key: "expiryDate", title: t("expiry"), sortable: true, width: 110, render: (r) => day(r.expiryDate) },
    {
      key: "left",
      title: t("ex.cLeft"),
      width: 140,
      render: (r) =>
        r.daysLeft < 0 ? (
          <Badge tone="danger" icon={CircleX}>
            {t("ov.k.expired")}
          </Badge>
        ) : (
          <Badge
            tone={r.daysLeft <= 30 ? "danger" : r.daysLeft <= EXPIRY_WARN_DAYS ? "warning" : "neutral"}
            icon={r.daysLeft <= 30 ? AlarmClock : r.daysLeft <= EXPIRY_WARN_DAYS ? TriangleAlert : CalendarClock}
          >
            {t("ov.daysLeft", { days: r.daysLeft })}
          </Badge>
        ),
    },
    {
      key: "available",
      title: t("ov.bp.avail"),
      align: "right",
      sortable: true,
      width: 90,
      render: (r) => <span className={cn("tabular-nums", !available(r) && "text-text-secondary")}>{formatQuantity(available(r))}</span>,
    },
    {
      key: "reserved",
      title: t("ov.bp.reserved"),
      align: "right",
      width: 80,
      render: (r) => <span className="tabular-nums text-text-secondary">{formatQuantity(r.reserved)}</span>,
    },
    ...(showCost
      ? [
          {
            key: "costSum",
            title: t("ov.tr.tValue"),
            align: "right" as const,
            width: 140,
            render: (r: StockRow) => <span className="tabular-nums">{r.costSum ? formatMoney(r.costSum) : ""}</span>,
          },
        ]
      : []),
    {
      key: "tip",
      title: t("ex.cTip"),
      wrap: true,
      render: (r) => {
        const tip = expiryTip(r);
        return (
          <span className={tip === "expired" ? "text-danger" : "text-text-secondary"}>
            {tip === "reserved" ? t("ex.tip.reserved", { n: formatQuantity(r.reserved) }) : t(`ex.tip.${tip}`)}
          </span>
        );
      },
    },
  ];

  const sortKey = Object.entries(SORT_COLUMNS).find(([, v]) => v === (f.sort ?? "EXPIRY"))?.[0] ?? "expiryDate";
  const safe = list.data && list.data.total === 0;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-page-title">{t("titleExpiry")}</h1>
        <span className="text-[13px] text-text-secondary">
          {t("ex.threshold", { days: EXPIRY_WARN_DAYS })} ·{" "}
          <Link href="/settings" className="text-primary hover:underline">
            {t("ex.settings")}
          </Link>
        </span>
      </div>

      {expired > 0 ? (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Alert tone="danger" className="min-w-0 flex-1" title={t("ex.banner", { n: expired })} />
          {canWriteOff ? (
            <Link
              href="/write-offs"
              className="inline-flex h-9 items-center gap-1.5 rounded-control border border-border bg-surface px-3 text-[13px] font-medium text-danger hover:border-danger"
            >
              <PackageMinus size={14} strokeWidth={1.5} aria-hidden />
              {t("ex.woAll")}
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {GROUPS.map((key) => {
          const x = g.find((y) => y.group === key);
          const on = f.group === key;
          const M = META[key];
          return (
            <button
              key={key}
              type="button"
              aria-pressed={on}
              onClick={() => apply({ group: on ? null : key })}
              className={cn(
                "flex min-w-0 flex-col items-start gap-1 rounded-card border p-4 text-left transition-colors",
                on ? "border-primary bg-primary-soft ring-1 ring-primary" : "border-border bg-surface hover:border-primary/50",
              )}
            >
              <span className="flex items-center gap-1.5 text-caption text-text-secondary">
                <M.icon size={14} strokeWidth={1.5} className={M.color} aria-hidden />
                {t(`ex.g.${key}`)}
              </span>
              <span className="flex items-baseline gap-1.5">
                <span
                  className={cn(
                    "text-[24px] leading-[30px] font-semibold tabular-nums",
                    x && x.batches > 0 ? M.color : "text-text-secondary",
                  )}
                >
                  {groups.error ? "—" : x ? formatQuantity(x.batches) : "…"}
                </span>
                <span className="text-caption text-text-secondary">{t("ov.k.batchUnit")}</span>
              </span>
              <span className="text-caption text-text-secondary">
                {x ? `${formatQuantity(x.qty)} ${t("ex.units")}` : ""}
                {x?.value != null ? ` · ${formatMoney(x.value)} ${t("ov.k.som")}` : ""}
              </span>
            </button>
          );
        })}
      </div>

      {list.error ? (
        <ErrorState onRetry={() => list.refetch()} />
      ) : safe && !f.group ? (
        <EmptyState icon={CircleCheck} title={t("ex.safeT", { days: EXPIRY_WARN_DAYS })} description={t("ex.safeD")} />
      ) : (
        <Table
          caption={t("titleExpiry")}
          columns={columns}
          rows={rows}
          rowKey={(r) => `${r.zoneId}:${r.batchId}`}
          loading={list.isPending}
          onRowClick={(r) => setPanel({ batchId: r.batchId, zoneId: r.zoneId })}
          sort={{ key: sortKey, dir: f.desc ? "desc" : "asc" }}
          onSortChange={(s) => apply({ sort: SORT_COLUMNS[s.key] ?? null, desc: s.dir === "desc" })}
          toolbar={
            <div className="flex flex-wrap items-center justify-end gap-3">
              <a href={`/api/stock/export?${exportQs.toString()}`} download>
                <Button variant="secondary" icon={Download}>
                  {t("export")}
                </Button>
              </a>
            </div>
          }
          emptyState={<EmptyState icon={CircleCheck} title={t("ex.noneInGroup")} description={t("ex.safeD")} />}
          pagination={
            list.data && list.data.total > 0
              ? {
                  page: f.page,
                  pageSize: f.size,
                  total: list.data.total,
                  onPageChange: (page) => apply({ page }),
                  onPageSizeChange: (size) => apply({ size: size === 20 || size === 100 ? size : 50 }),
                  pageSizeOptions: [20, 50, 100],
                }
              : undefined
          }
        />
      )}
      {panel ? <BatchPanel batchId={panel.batchId} zoneId={panel.zoneId} onClose={() => setPanel(null)} /> : null}
    </>
  );
}
