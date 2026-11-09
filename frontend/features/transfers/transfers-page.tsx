"use client";

import {
  ArrowLeftRight,
  ArrowUpRight,
  Building2,
  CircleCheck,
  CircleX,
  Clock,
  FilePen,
  Layers,
  OctagonX,
  PackageCheck,
  Plus,
  TriangleAlert,
  Truck,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateChip, MultiFilter } from "@/components/ui/multi-filter";
import type { PageSize } from "@/components/ui/pagination";
import { RowMenu } from "@/components/ui/row-menu";
import { EmptyState, ErrorState, ForbiddenState, NoResultsState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { TextField } from "@/components/ui/text-field";
import { can, canAny } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { TRANSFER_ANY } from "@/components/shell/nav";
import { cn } from "@/lib/cn";
import { formatDate, formatMoney, formatQuantity } from "@/lib/format";
import { useBranchStore } from "@/lib/stores/branch";
import { useTransfersOverview } from "./api";
import {
  EMPTY_FILTERS,
  KIND_CREATE,
  KIND_PAGE,
  TRANSFER_KINDS,
  TRANSFER_STATES,
  TRANSFER_VIEWS,
  docHref,
  inView,
  kpisOf,
  matches,
  type TransferFilters,
  type TransferItem,
  type TransferKind,
  type TransferState,
} from "./model";

const KIND_ICON: Record<TransferKind, LucideIcon> = { ZK: Layers, OK: Warehouse, FS: Building2 };

const STATE_STYLE: Record<TransferState, { tone: Tone; icon: LucideIcon }> = {
  DRAFT: { tone: "neutral", icon: FilePen },
  PENDING: { tone: "warning", icon: Clock },
  POSTED: { tone: "success", icon: CircleCheck },
  TRANSIT: { tone: "info", icon: Truck },
  RECEIVED: { tone: "success", icon: CircleCheck },
  DIFF: { tone: "warning", icon: TriangleAlert },
  REJECTED: { tone: "danger", icon: OctagonX },
  CANCELLED: { tone: "neutral", icon: CircleX },
};

function KpiTile(props: {
  icon: LucideIcon;
  tone: "info" | "primary" | "neutral" | "warning";
  label: string;
  value: string;
  note: string;
  active: boolean;
  warn?: boolean;
  onClick: () => void;
}) {
  const Icon = props.icon;
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-pressed={props.active}
      className={cn(
        "flex min-w-0 flex-col items-start gap-1.5 rounded-card border bg-surface px-4 py-3.5 text-left shadow-sm transition-colors hover:border-text-secondary",
        props.active ? "border-primary" : "border-border",
      )}
    >
      <span className="flex items-center gap-2 text-caption font-medium text-text-secondary">
        <span
          className={cn(
            "flex size-6 flex-none items-center justify-center rounded-md",
            props.tone === "info" && "bg-info-bg text-info",
            props.tone === "primary" && "bg-primary-soft text-primary",
            props.tone === "warning" && "bg-warning-bg text-warning",
            props.tone === "neutral" && "bg-table-header text-text-secondary",
          )}
        >
          <Icon size={14} strokeWidth={1.5} aria-hidden />
        </span>
        {props.label}
      </span>
      <span className={cn("tabular max-w-full truncate text-kpi", props.warn && "text-warning")}>{props.value}</span>
      <span className="max-w-full truncate text-caption text-text-secondary">{props.note}</span>
    </button>
  );
}

/** «Yangi» — tur tanlash menyusi (prototip: ikonka, nom, izoh). */
function NewMenu({ kinds, onPick }: { kinds: TransferKind[]; onPick: (k: TransferKind) => void }) {
  const t = useTranslations("transfers");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e instanceof MouseEvent && ref.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <Button icon={Plus} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {t("new")}
      </Button>
      {open ? (
        <div
          role="menu"
          aria-label={t("newMenu")}
          className="absolute right-0 top-10 z-40 w-[360px] max-w-[calc(100vw-32px)] rounded-card border border-border bg-surface p-1 shadow-overlay"
        >
          {kinds.map((k) => {
            const Icon = KIND_ICON[k];
            return (
              <button
                key={k}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onPick(k);
                }}
                className="flex w-full items-start gap-2.5 rounded-control p-2.5 text-left hover:bg-table-header focus-visible:bg-table-header"
              >
                <span className="flex size-7 flex-none items-center justify-center rounded-md bg-primary-soft text-primary">
                  <Icon size={16} strokeWidth={1.5} aria-hidden />
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[13px] font-semibold">{t(`kind.${k}`)}</span>
                  <span className="text-caption text-text-secondary">{t(`kindDesc.${k}`)}</span>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/** Koʻchirish — ZK, OK, FS bitta roʻyxatda (prototip `Transfers`). Hujjat ochish/yaratish — tur sahifasida. */
export function TransfersPage() {
  const t = useTranslations("transfers");
  const me = useMe();
  const router = useRouter();
  const selectedBranch = useBranchStore((s) => s.branchId);
  const branchId = me.data?.allBranches ? (selectedBranch ?? null) : null;
  const allowed = canAny(me.data, [...TRANSFER_ANY]);
  // FS yoʻnalishi (chiquvchi/kiruvchi) faqat bitta filial nuqtai nazaridan maʼnoli
  const scoped = branchId != null || me.data?.allBranches === false;
  const overview = useTransfersOverview(branchId, allowed);
  const [f, setF] = useState<TransferFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [per, setPer] = useState<PageSize>(25);

  if (me.data && !allowed) return <ForbiddenState description={t("forbidden")} />;

  const all = overview.data?.items ?? [];
  const apply = (patch: Partial<TransferFilters>) => {
    setF((cur) => ({ ...cur, ...patch }));
    setPage(1);
  };
  const reset = (patch: Partial<TransferFilters>) => {
    setF({ ...EMPTY_FILTERS, ...patch });
    setPage(1);
  };
  const rows = all.filter((x) => matches(x, f));
  const shown = rows.slice((page - 1) * per, page * per);
  const k = kpisOf(all);
  const showSum = all.some((x) => x.total != null) || can(me.data, "special.cost");
  const creatable = TRANSFER_KINDS.filter((kind) => can(me.data, KIND_CREATE[kind]));
  const canReceive = can(me.data, "transfer.receive");
  const hasFilters = f.kinds.length > 0 || f.states.length > 0 || f.from != null || f.q !== "";
  const onlyStates = (...s: TransferState[]) => f.states.length === s.length && s.every((x) => f.states.includes(x));

  const place = (p: TransferItem["from"], withZone: boolean) =>
    [p.branch ? `${p.branch.code} · ${p.warehouse}` : p.warehouse, withZone && p.zone ? p.zone : null].filter(Boolean).join(" · ");

  const columns: TableColumn<TransferItem>[] = [
    {
      key: "number",
      title: t("col.number"),
      render: (x) => <span className={cn("font-mono text-[12.5px]", dead(x) && "text-text-secondary")}>{x.number}</span>,
    },
    {
      key: "kind",
      title: t("col.kind"),
      render: (x) => {
        const Icon = KIND_ICON[x.kind];
        const dir = x.kind === "FS" && scoped ? ` · ${x.direction === "IN" ? t("in") : t("out")}` : "";
        return (
          <span className={cn("flex items-center gap-1.5 whitespace-nowrap", dead(x) && "text-text-secondary")}>
            <Icon size={16} strokeWidth={1.5} aria-hidden className="flex-none text-text-secondary" />
            {t(`kind.${x.kind}`)}
            {dir}
          </span>
        );
      },
    },
    {
      key: "date",
      title: t("col.date"),
      render: (x) => <span className="tabular text-text-secondary">{formatDate(new Date(x.createdAt))}</span>,
    },
    {
      key: "route",
      title: t("col.route"),
      wrap: true,
      render: (x) => (
        <span className={cn("flex min-w-0 flex-col", dead(x) && "text-text-secondary")}>
          <span className="font-medium">{x.kind === "ZK" ? place(x.from, false) : `${place(x.from, false)} → ${place(x.to, false)}`}</span>
          <span className="text-caption text-text-secondary">
            {x.kind === "ZK" ? `${x.from.zone ?? "—"} → ${x.to.zone ?? "—"}` : (x.invoiceNumber ?? "")}
            {x.shortageQty > 0 ? ` · ${t("shortage", { qty: formatQuantity(x.shortageQty) })}` : ""}
          </span>
        </span>
      ),
    },
    { key: "lines", title: t("col.lines"), align: "right", render: (x) => <span className="tabular">{formatQuantity(x.lines)}</span> },
    { key: "qty", title: t("col.qty"), align: "right", render: (x) => <span className="tabular">{formatQuantity(x.qty)}</span> },
    ...(showSum
      ? [
          {
            key: "sum",
            title: t("col.sum"),
            align: "right" as const,
            render: (x: TransferItem) =>
              x.total ? (
                <span className={cn("tabular", dead(x) && "text-text-secondary")}>{formatMoney(x.total)}</span>
              ) : (
                <span className="text-text-secondary">—</span>
              ),
          },
        ]
      : []),
    {
      key: "status",
      title: t("col.status"),
      render: (x) => (
        <Badge tone={STATE_STYLE[x.state].tone} icon={STATE_STYLE[x.state].icon}>
          {t(`state.${x.state}`)}
        </Badge>
      ),
    },
    { key: "createdBy", title: t("col.createdBy"), render: (x) => <span className="text-text-secondary">{x.createdBy}</span> },
  ];

  const opt = <V extends string>(values: readonly V[], key: (x: TransferItem) => V, label: (v: V) => string) =>
    values.map((v) => ({ value: v, label: label(v), count: all.filter((x) => key(x) === v).length }));

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="flex items-baseline gap-2 text-page-title">
          {t("title")}
          {overview.data ? (
            <span className="text-body font-normal text-text-secondary tabular-nums" aria-label={t("countLabel")}>
              {formatQuantity(all.length)}
            </span>
          ) : null}
        </h1>
        {creatable.length ? <NewMenu kinds={creatable} onPick={(kind) => router.push(`${KIND_PAGE[kind]}?new=1`)} /> : null}
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiTile
          icon={Truck}
          tone="info"
          label={t("kpi.transit")}
          value={t("kpi.count", { count: formatQuantity(k.transit) })}
          note={
            k.transitSum != null ? t("kpi.cost", { sum: formatMoney(k.transitSum) }) : t("kpi.qty", { qty: formatQuantity(k.transitQty) })
          }
          active={f.view === "transit" && f.states.length === 0}
          onClick={() => reset({ view: "transit" })}
        />
        <KpiTile
          icon={PackageCheck}
          tone="primary"
          label={t("kpi.incoming")}
          value={t("kpi.count", { count: formatQuantity(k.incoming) })}
          note={t("kpi.incomingNote")}
          active={f.view === "in" && onlyStates("TRANSIT")}
          onClick={() => reset({ view: "in", states: ["TRANSIT"] })}
        />
        <KpiTile
          icon={FilePen}
          tone="neutral"
          label={t("kpi.drafts")}
          value={t("kpi.count", { count: formatQuantity(k.drafts) })}
          note={t("kpi.pending", { count: formatQuantity(k.pending) })}
          active={onlyStates("DRAFT", "PENDING")}
          onClick={() => reset({ states: ["DRAFT", "PENDING"] })}
        />
        <KpiTile
          icon={TriangleAlert}
          tone="warning"
          label={t("kpi.diff")}
          value={t("kpi.count", { count: formatQuantity(k.diffs) })}
          note={t("kpi.diffNote")}
          warn={k.diffs > 0}
          active={onlyStates("DIFF")}
          onClick={() => reset({ states: ["DIFF"] })}
        />
      </div>
      {overview.data?.truncated ? <Alert tone="info" title={t("truncated")} className="mb-3" /> : null}
      <div className="mb-3">
        <Tabs
          aria-label={t("viewsLabel")}
          items={TRANSFER_VIEWS.map((v) => ({ key: v, label: t(`view.${v}`), count: all.filter((x) => inView(x, v)).length }))}
          value={f.view}
          onChange={(v) => apply({ view: v as TransferFilters["view"] })}
        />
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="w-80">
          <TextField
            label={t("search")}
            variant="search"
            size="sm"
            value={f.q}
            onChange={(v) => apply({ q: v })}
            placeholder={t("searchPlaceholder")}
            className="[&>label]:sr-only"
          />
        </div>
        <MultiFilter
          label={t("col.kind")}
          options={opt(
            TRANSFER_KINDS,
            (x) => x.kind,
            (v) => t(`kind.${v}`),
          )}
          selected={f.kinds}
          onChange={(v) => apply({ kinds: v })}
        />
        <MultiFilter
          label={t("col.status")}
          options={opt(
            TRANSFER_STATES,
            (x) => x.state,
            (v) => t(`state.${v}`),
          ).filter((o) => o.count > 0 || f.states.includes(o.value))}
          selected={f.states}
          onChange={(v) => apply({ states: v })}
        />
        <DateChip label={t("col.date")} from={f.from} to={f.to} invalid={t("dateInvalid")} onChange={(from, to) => apply({ from, to })} />
        {hasFilters ? (
          <button
            type="button"
            onClick={() => reset({ view: f.view })}
            className="h-control-sm px-1.5 text-[13px] font-medium text-primary-button hover:underline"
          >
            {t("clearFilters")}
          </button>
        ) : null}
      </div>
      {overview.error ? (
        <ErrorState onRetry={() => overview.refetch()} />
      ) : (
        <Table
          caption={t("title")}
          columns={columns}
          rows={shown}
          rowKey={(x) => `${x.kind}-${x.id}`}
          loading={overview.isPending}
          onRowClick={(x) => router.push(docHref(x))}
          rowActions={(x) => (
            <RowMenu
              label={t("rowActions")}
              items={[
                {
                  key: "open",
                  label: t("open"),
                  icon: <ArrowUpRight size={16} strokeWidth={1.5} aria-hidden />,
                  onSelect: () => router.push(docHref(x)),
                },
                ...(x.state === "TRANSIT" && inView(x, "in") && canReceive
                  ? [
                      {
                        key: "receive",
                        label: t("receive"),
                        icon: <PackageCheck size={16} strokeWidth={1.5} aria-hidden />,
                        onSelect: () => router.push(docHref(x)),
                      },
                    ]
                  : []),
              ]}
            />
          )}
          emptyState={
            all.length === 0 ? (
              <EmptyState icon={ArrowLeftRight} title={t("emptyTitle")} description={t("emptyText")} />
            ) : (
              <NoResultsState onClearFilters={() => reset({})} />
            )
          }
          pagination={
            rows.length > 0
              ? {
                  page,
                  pageSize: per,
                  total: rows.length,
                  onPageChange: setPage,
                  onPageSizeChange: (n) => {
                    setPer(n);
                    setPage(1);
                  },
                }
              : undefined
          }
        />
      )}
    </>
  );
}

function dead(x: TransferItem): boolean {
  return x.state === "CANCELLED" || x.state === "REJECTED";
}
