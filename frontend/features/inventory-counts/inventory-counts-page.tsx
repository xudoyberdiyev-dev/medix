"use client";

import {
  CircleCheck,
  ClipboardCheck,
  FilePen,
  ListChecks,
  Plus,
  ScanSearch,
  ShieldAlert,
  Stamp,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { formatIsoDate } from "@/features/counterparties/api";
import { cn } from "@/lib/cn";
import { EmptyState, ErrorState, ForbiddenState, NoResultsState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { can, canAny } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { formatDateTime, formatMoney, formatQuantity } from "@/lib/format";
import { useBranchStore } from "@/lib/stores/branch";
import {
  IN_CREATE,
  IN_STATUS_LABELS,
  IN_VIEW_KEYS,
  useInventoryCounts,
  useInventoryOverview,
  type InventoryCountStatus,
  type InventoryCountSummary,
} from "./api";

export function InventoryCountStatusBadge({ status }: { status: InventoryCountStatus }) {
  const t = useTranslations("inventoryCounts.status");
  const map = {
    DRAFT: { tone: "neutral", icon: FilePen },
    COUNTING: { tone: "info", icon: ScanSearch },
    CHECK: { tone: "warning", icon: ClipboardCheck },
    POSTED: { tone: "success", icon: CircleCheck },
    CANCELLED: { tone: "neutral", icon: XCircle },
  } as const;
  return (
    <Badge tone={map[status].tone} icon={map[status].icon}>
      {t(status)}
    </Badge>
  );
}

/** IN — inventarizatsiya: qoralama → sanoq (zonalar qulflanadi) → tekshirish → tasdiq. Kamomad 5 000 000 dan katta — Direktor. */
export function InventoryCountsPage() {
  const t = useTranslations("inventoryCounts");
  const me = useMe();
  const selectedBranch = useBranchStore((s) => s.branchId);
  const params = useSearchParams();
  const [status, setStatus] = useState<string | null>(params.get("status"));
  const [page, setPage] = useState(1);
  const router = useRouter();
  const openId = Number(params.get("open"));
  // Eski havolalar (bildirishnoma `?open=`) — hujjat sahifasiga
  useEffect(() => {
    if (Number.isInteger(openId) && openId > 0) router.replace(`/inventory-counts/${openId}`);
  }, [openId, router]);
  const allowed = canAny(me.data, IN_VIEW_KEYS);
  const canCreate = can(me.data, IN_CREATE);
  const branchId = me.data?.allBranches ? (selectedBranch ?? null) : null;
  const docs = useInventoryCounts(branchId, (status as InventoryCountStatus | null) ?? null, page);
  const ov = useInventoryOverview(branchId, allowed);
  const countOf = (s: InventoryCountStatus) => ov.data?.statuses.find((x) => x.status === s)?.count ?? 0;
  const totalCount = (ov.data?.statuses ?? []).reduce((a, x) => a + x.count, 0);

  if (me.data && !allowed) return <ForbiddenState description={t("forbidden")} />;

  const showCost = (docs.data?.items ?? []).some((d) => d.shortageCost != null);
  const columns: TableColumn<InventoryCountSummary>[] = [
    { key: "number", title: t("list.number"), mono: true },
    { key: "createdAt", title: t("list.date"), render: (d) => formatDateTime(new Date(d.createdAt)) },
    {
      key: "warehouse",
      title: t("ov.scope"),
      render: (d) => `${d.warehouse} · ${scopeText(d, t("list.wholeWarehouse"), (n) => t("doc.nProd", { n }))}`,
    },
    {
      key: "commission",
      title: t("ov.commission"),
      render: (d) => {
        const names = (d.commission ?? "")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean);
        if (names.length === 0) return <span className="text-text-secondary">—</span>;
        return (
          <div className="flex flex-col">
            <span>{names[0]}</span>
            {names.length > 1 ? <span className="text-caption text-text-secondary">{t("ov.plusN", { n: names.length - 1 })}</span> : null}
          </div>
        );
      },
    },
    {
      key: "counted",
      title: t("list.counted"),
      align: "right",
      render: (d) => (d.lines > 0 ? `${formatQuantity(d.counted)} / ${formatQuantity(d.lines)}` : "—"),
    },
    {
      key: "shortageQty",
      title: t("list.shortage"),
      align: "right",
      render: (d) => (d.shortageQty ? t("list.pcs", { qty: formatQuantity(d.shortageQty) }) : "—"),
    },
    {
      key: "surplusQty",
      title: t("list.surplus"),
      align: "right",
      render: (d) => (d.surplusQty ? t("list.pcs", { qty: formatQuantity(d.surplusQty) }) : "—"),
    },
    ...(showCost
      ? [
          {
            key: "shortageCost",
            title: t("list.shortageCost"),
            align: "right" as const,
            render: (d: InventoryCountSummary) => (d.shortageCost != null && d.shortageQty ? formatMoney(d.shortageCost) : "—"),
          },
        ]
      : []),
    { key: "createdBy", title: t("list.createdBy") },
    {
      key: "status",
      title: t("list.status"),
      render: (d) => (
        <span className="flex items-center gap-2">
          <InventoryCountStatusBadge status={d.status} />
          {d.needsDirector && d.status === "CHECK" ? (
            <Badge tone="danger" icon={ShieldAlert}>
              {t("list.director")}
            </Badge>
          ) : null}
        </span>
      ),
    },
  ];

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="flex items-baseline gap-2 text-page-title">
          {t("title")}
          {ov.data ? <span className="tabular text-body text-text-secondary">{formatQuantity(totalCount)}</span> : null}
        </h1>
        {canCreate ? (
          <Button icon={Plus} onClick={() => router.push("/inventory-counts/new")}>
            {t("start")}
          </Button>
        ) : null}
      </div>
      {ov.data ? (
        <div className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2.2fr)]">
          <Kpi
            icon={ScanSearch}
            iconClass="bg-info-bg text-info"
            label={t("ov.kCounting")}
            value={t("ov.nDocs", { n: countOf("COUNTING") })}
            note={t("ov.kCountingNote")}
            active={status === "COUNTING"}
            onClick={() => (setStatus(status === "COUNTING" ? null : "COUNTING"), setPage(1))}
          />
          <Kpi
            icon={Stamp}
            iconClass="bg-warning-bg text-warning"
            label={t("ov.kCheck")}
            value={t("ov.nDocs", { n: countOf("CHECK") })}
            note={t("ov.kCheckNote")}
            active={status === "CHECK"}
            onClick={() => (setStatus(status === "CHECK" ? null : "CHECK"), setPage(1))}
          />
          <section className="flex min-w-0 flex-col gap-2 rounded-card border border-border bg-surface px-4 py-3.5">
            <span className="text-caption font-medium text-text-secondary">{t("ov.lastTitle")}</span>
            <div className={cn("grid gap-x-6 gap-y-1", ov.data.lastFull.length >= 4 && "md:grid-cols-2")}>
              {ov.data.lastFull.map((w) => {
                const warn = w.days == null || w.days > ov.data.remindDays;
                return (
                  <div key={w.warehouseId} className="flex min-w-0 items-baseline justify-between gap-3 text-table">
                    <span className="truncate">{me.data?.allBranches ? `${w.branch} · ${w.warehouse}` : w.warehouse}</span>
                    <span className={cn("whitespace-nowrap", warn ? "font-semibold text-warning" : "text-text-primary")}>
                      {w.date
                        ? `${formatIsoDate(w.date)} · ${w.days === 0 ? t("ov.today") : t("ov.daysAgo", { n: w.days ?? 0 })}`
                        : t("ov.lastNever")}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      ) : null}
      <div className="mb-3">
        <Tabs
          aria-label={t("ov.tabsLabel")}
          value={status ?? "all"}
          onChange={(k) => (setStatus(k === "all" ? null : k), setPage(1))}
          items={[
            { key: "all", label: t("ov.all"), count: ov.data ? totalCount : undefined },
            ...(Object.keys(IN_STATUS_LABELS) as InventoryCountStatus[]).map((k) => ({
              key: k,
              label: t(`status.${k}`),
              count: ov.data ? countOf(k) : undefined,
            })),
          ]}
        />
      </div>
      {docs.error ? (
        <ErrorState onRetry={() => docs.refetch()} />
      ) : (
        <Table
          caption={t("caption")}
          columns={columns}
          rows={docs.data?.items ?? []}
          rowKey={(d) => String(d.id)}
          loading={docs.isPending}
          onRowClick={(d) => router.push(`/inventory-counts/${d.id}`)}
          emptyState={
            status !== null ? (
              <NoResultsState onClearFilters={() => setStatus(null)} />
            ) : (
              <EmptyState
                icon={ListChecks}
                title={t("list.emptyTitle")}
                description={t("list.emptyDescription")}
                action={
                  canCreate ? (
                    <Button variant="secondary" icon={Plus} onClick={() => router.push("/inventory-counts/new")}>
                      {t("start")}
                    </Button>
                  ) : undefined
                }
              />
            )
          }
          pagination={
            docs.data && docs.data.total > 50
              ? {
                  page,
                  pageSize: 50,
                  total: docs.data.total,
                  onPageChange: setPage,
                  onPageSizeChange: () => undefined,
                  pageSizeOptions: [50],
                }
              : undefined
          }
        />
      )}
    </>
  );
}

function Kpi(props: {
  icon: LucideIcon;
  iconClass: string;
  label: string;
  value: string;
  note: string;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = props.icon;
  return (
    <button
      type="button"
      aria-pressed={props.active}
      onClick={props.onClick}
      className={cn(
        "flex min-w-0 flex-col gap-1.5 rounded-card border bg-surface px-4 py-3.5 text-left transition-colors hover:border-text-secondary",
        props.active ? "border-primary" : "border-border",
      )}
    >
      <span className="flex items-center gap-2 text-caption font-medium text-text-secondary">
        <span className={cn("flex size-6 flex-none items-center justify-center rounded-[6px]", props.iconClass)}>
          <Icon size={14} strokeWidth={1.5} aria-hidden />
        </span>
        {props.label}
      </span>
      <span className="text-stat tabular-nums">{props.value}</span>
      <span className="text-caption text-text-secondary">{props.note}</span>
    </button>
  );
}

/** Qamrov matni: zonalar (vergul bilan) yoki «butun ombor» + mahsulotlar soni. */
export function scopeText(
  d: Pick<InventoryCountSummary, "zoneNames" | "productCount" | "scopeMode">,
  whole: string,
  nProd: (n: number) => string,
): string {
  const zones = d.zoneNames.length ? d.zoneNames.join(", ") : whole;
  return d.productCount > 0 ? `${zones} · ${nProd(d.productCount)}` : zones;
}
