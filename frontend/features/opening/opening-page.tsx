"use client";

import {
  ArrowUpRight,
  Ban,
  Banknote,
  CircleCheck,
  CircleDashed,
  Database,
  FilePen,
  Package,
  Plus,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RowMenu } from "@/components/ui/row-menu";
import { EmptyState, ErrorState, ForbiddenState, NoResultsState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { can, canAny } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { useBranchList, useWarehouses } from "@/features/organization/api";
import { toLatin } from "@/features/transfers/model";
import { cn } from "@/lib/cn";
import { formatDate, formatMoney, formatQuantity } from "@/lib/format";
import { useBranchStore } from "@/lib/stores/branch";
import { OPENING_CREATE, OPENING_GOODS, useAllOpenings, type OpeningStatus } from "./api";
import { FinanceDrawer } from "./finance-drawer";
import { useFinOpenings, type FinKind } from "./finance-api";
import { BQ_TYPES, buildMatrix, legendOf, type BqDoc, type BqType, type CellState, type MatrixItem } from "./matrix";

export function OpeningStatusBadge({ status }: { status: OpeningStatus }) {
  const t = useTranslations("opening.status");
  const map = {
    DRAFT: { tone: "neutral", icon: FilePen },
    POSTED: { tone: "success", icon: CircleCheck },
    CANCELLED: { tone: "neutral", icon: Ban },
  } as const;
  return (
    <Badge tone={map[status].tone} icon={map[status].icon}>
      {t(status)}
    </Badge>
  );
}

const TYPE_ICON: Record<BqType, LucideIcon> = { GOODS: Package, CUSTOMER_DEBT: Users, SUPPLIER_DEBT: Truck, MONEY: Banknote };
const CELL_STYLE: Record<CellState, { tone: Tone; icon: LucideIcon; dot: string }> = {
  NONE: { tone: "neutral", icon: CircleDashed, dot: "bg-text-tertiary" },
  DRAFT: { tone: "warning", icon: FilePen, dot: "bg-warning" },
  POSTED: { tone: "success", icon: CircleCheck, dot: "bg-success" },
};
const VIEWS = ["ALL", "DRAFT", "POSTED", "CANCELLED"] as const;

const day = (iso: string) => formatDate(new Date(`${iso}T00:00:00+05:00`));

type Editor = { type: "GOODS"; id: number | null } | { type: FinKind; id: number | null; branchId: number | null };

function NewMenu({ types, onPick }: { types: BqType[]; onPick: (t: BqType) => void }) {
  const t = useTranslations("opening");
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
        {t("newDoc")}
      </Button>
      {open ? (
        <div
          role="menu"
          aria-label={t("newMenu")}
          className="absolute right-0 top-10 z-40 w-[360px] max-w-[calc(100vw-32px)] rounded-card border border-border bg-surface p-1 shadow-overlay"
        >
          {types.map((k) => {
            const Icon = TYPE_ICON[k];
            return (
              <button
                key={k}
                type="button"
                role="menuitem"
                onClick={() => (setOpen(false), onPick(k))}
                className="flex w-full items-start gap-2.5 rounded-control p-2.5 text-left hover:bg-table-header focus-visible:bg-table-header"
              >
                <span className="flex size-7 flex-none items-center justify-center rounded-md bg-primary-soft text-primary">
                  <Icon size={16} strokeWidth={1.5} aria-hidden />
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[13px] font-semibold">{t(`type.${k}`)}</span>
                  <span className="text-caption text-text-secondary">{t(`typeDesc.${k}`)}</span>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/** Boshlangʻich qoldiq (prototip `OpeningBalances`): «Koʻchirish holati» matritsasi (filial × tur) va BQ hujjatlari. */
export function OpeningPage() {
  const t = useTranslations("opening");
  const me = useMe();
  const selectedBranch = useBranchStore((s) => s.branchId);
  const allowed = canAny(me.data, ["opening.list", "opening.view"]);
  const canList = can(me.data, "opening.list");
  const canCreate = can(me.data, OPENING_CREATE);
  const branchId = me.data?.allBranches ? (selectedBranch ?? null) : null;
  const goods = useAllOpenings(branchId, allowed);
  const fin = useFinOpenings(branchId, allowed);
  const branches = useBranchList();
  const warehouses = useWarehouses();
  const [view, setView] = useState<(typeof VIEWS)[number]>("ALL");
  const [q, setQ] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null);
  const router = useRouter();

  if (me.data && !allowed) return <ForbiddenState description={t("forbidden")} />;

  const branchName = (id: number | null) => branches.data?.find((b) => b.id === id)?.name ?? "";
  const docs: BqDoc[] = [
    ...(goods.data?.items ?? []).map((d): BqDoc => ({
      key: `g${d.id}`,
      id: d.id,
      type: "GOODS",
      number: d.number,
      branchId: d.branchId,
      warehouseId: d.warehouseId,
      place: `${branchName(d.branchId)} · ${d.warehouse}`,
      cutoffDate: d.cutoffDate,
      lines: d.lines,
      total: d.totalCost ?? null,
      source: d.source,
      status: d.status,
      postedAt: d.postedAt ?? null,
      createdAt: d.createdAt,
    })),
    ...(fin.data ?? []).map((d): BqDoc => ({
      key: `f${d.id}`,
      id: d.id,
      type: d.kind,
      number: d.number,
      branchId: d.branchId,
      warehouseId: null,
      place: d.branch,
      cutoffDate: d.cutoffDate,
      lines: d.lines,
      total: d.total,
      source: "MANUAL",
      status: d.status,
      postedAt: d.postedAt ?? null,
      createdAt: d.createdAt,
    })),
  ].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const scopeBranch = branchId ?? (me.data?.allBranches ? null : (me.data?.branchId ?? null));
  const rows = buildMatrix(
    (branches.data ?? []).filter((b) => scopeBranch == null || b.id === scopeBranch),
    (warehouses.data ?? []).map((w) => ({ id: w.id, branchId: w.branchId, name: w.name, active: w.active })),
    docs,
  );
  const legend = legendOf(rows);
  const creatable = BQ_TYPES.filter((k) => canCreate && (k !== "GOODS" || can(me.data, OPENING_GOODS)));

  // Tovar BQ — toʻliq sahifa (prototip OpeningDoc); pul BQ — drawer
  const openDoc = (d: BqDoc) =>
    d.type === "GOODS" ? router.push(`/opening/goods/${d.id}`) : setEditor({ type: d.type, id: d.id, branchId: d.branchId });
  const openNew = (type: BqType, forBranch: number | null) => {
    if (type === "GOODS") return router.push("/opening/goods/new");
    if (forBranch == null) return toast({ tone: "warning", title: t("fin.pickBranch") });
    setEditor({ type, id: null, branchId: forBranch });
  };
  const pickCell = (type: BqType, branch: number, c: MatrixItem) => {
    if (c.doc && canList) return openDoc(c.doc);
    if (!c.doc && creatable.includes(type)) openNew(type, branch);
  };

  const ql = toLatin(q.trim());
  const shown = docs.filter(
    (d) => (view === "ALL" || d.status === view) && (!ql || toLatin(`${d.number} ${d.place} ${t(`type.${d.type}`)}`).includes(ql)),
  );

  const columns: TableColumn<BqDoc>[] = [
    { key: "number", title: t("col.number"), mono: true },
    {
      key: "type",
      title: t("col.type"),
      render: (d) => {
        const Icon = TYPE_ICON[d.type];
        return (
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <Icon size={16} strokeWidth={1.5} aria-hidden className="text-text-secondary" />
            {t(`type.${d.type}`)}
          </span>
        );
      },
    },
    { key: "place", title: t("col.place"), wrap: true },
    { key: "cutoff", title: t("col.cutoff"), render: (d) => <span className="tabular">{day(d.cutoffDate)}</span> },
    {
      key: "lines",
      title: t("col.lines"),
      align: "right",
      render: (d) => <span className="tabular">{d.lines ? formatQuantity(d.lines) : "—"}</span>,
    },
    {
      key: "sum",
      title: t("col.sum"),
      align: "right",
      render: (d) =>
        d.total && d.lines ? (
          <span className="tabular font-semibold">{formatMoney(d.total)}</span>
        ) : (
          <span className="text-text-secondary">—</span>
        ),
    },
    { key: "source", title: t("col.source"), render: (d) => <span className="text-text-secondary">{t(`source.${d.source}`)}</span> },
    { key: "status", title: t("col.status"), render: (d) => <OpeningStatusBadge status={d.status} /> },
  ];

  const loading = goods.isPending || fin.isPending || branches.isPending || warehouses.isPending;
  const error = goods.error ?? fin.error ?? branches.error ?? warehouses.error;

  return (
    <>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex items-baseline gap-2 text-page-title">
            {t("title")}
            {canList && !loading ? (
              <span className="text-body font-normal text-text-secondary tabular-nums">{formatQuantity(docs.length)}</span>
            ) : null}
          </h1>
          <p className="mt-1 text-body text-text-secondary">{t("subtitle")}</p>
        </div>
        {canList && creatable.length ? <NewMenu types={creatable} onPick={(k) => openNew(k, scopeBranch)} /> : null}
      </div>
      {error ? (
        <ErrorState onRetry={() => (goods.refetch(), fin.refetch(), branches.refetch(), warehouses.refetch())} />
      ) : (
        <section className="mb-4 rounded-card border border-border bg-surface shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3.5">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-[15px] font-semibold">
                <Database size={18} strokeWidth={1.5} aria-hidden className="text-primary" />
                {t("matrix.title")}
              </h2>
              <p className="text-caption text-text-secondary">{t("matrix.hint")}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-caption text-text-secondary">
              {(["NONE", "DRAFT", "POSTED"] as const).map((k) => (
                <span key={k} className="flex items-center gap-1.5">
                  <span className={cn("size-2 rounded-full", CELL_STYLE[k].dot)} aria-hidden />
                  {t(`matrix.state.${k}`)}
                  <span className="tabular">{legend[k]}</span>
                </span>
              ))}
            </div>
          </div>
          {!canList ? <Alert tone="info" title={t("matrix.readOnly")} className="mx-4 mt-3" /> : null}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] table-fixed border-collapse text-left">
              <caption className="sr-only">{t("matrix.title")}</caption>
              <thead>
                <tr className="border-b border-border bg-table-header text-caption font-medium text-text-secondary">
                  <th scope="col" className="w-[170px] px-4 py-2.5 font-medium">
                    {t("matrix.branch")}
                  </th>
                  {BQ_TYPES.map((k) => {
                    const Icon = TYPE_ICON[k];
                    return (
                      <th key={k} scope="col" className="px-3 py-2.5 font-medium">
                        <span className="flex items-center gap-1.5">
                          <Icon size={14} strokeWidth={1.5} aria-hidden />
                          {t(`type.${k}`)}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-caption text-text-secondary">
                      …
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.branchId} className="border-b border-border-subtle align-top last:border-b-0">
                      <th scope="row" className="px-4 py-3 text-left font-normal">
                        <span className="block text-[13.5px] font-semibold">{r.name}</span>
                        <span className="text-caption text-text-tertiary">
                          {t("matrix.wh", { posted: r.postedWarehouses, total: r.warehouses })}
                        </span>
                      </th>
                      {BQ_TYPES.map((k) => (
                        <td key={k} className="border-l border-border-subtle p-2">
                          <div className="flex flex-col gap-1.5">
                            {r.cells[k].map((c, i) => {
                              const S = CELL_STYLE[c.state];
                              return (
                                <button
                                  key={c.warehouseId ?? i}
                                  type="button"
                                  onClick={() => pickCell(k, r.branchId, c)}
                                  className="flex w-full min-w-0 flex-col items-start gap-1 rounded-control border border-border bg-surface px-2.5 py-2 text-left hover:border-text-secondary hover:bg-table-header"
                                >
                                  {c.label ? <span className="max-w-full truncate text-caption text-text-secondary">{c.label}</span> : null}
                                  <span className="flex flex-wrap items-center gap-1.5">
                                    <Badge tone={S.tone} icon={S.icon}>
                                      {t(`matrix.state.${c.state}`)}
                                    </Badge>
                                    {c.state === "POSTED" && c.doc?.postedAt ? (
                                      <span className="text-caption text-text-secondary">{formatDate(new Date(c.doc.postedAt))}</span>
                                    ) : null}
                                  </span>
                                  {c.doc && canList ? (
                                    <span className="font-mono text-[11.5px] text-text-tertiary">{c.doc.number}</span>
                                  ) : null}
                                </button>
                              );
                            })}
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {canList && !error ? (
        <>
          <div className="mb-3">
            <Tabs
              aria-label={t("views.label")}
              items={VIEWS.map((v) => ({
                key: v,
                label: t(`views.${v}`),
                count: docs.filter((d) => v === "ALL" || d.status === v).length,
              }))}
              value={view}
              onChange={(v) => setView(v as (typeof VIEWS)[number])}
            />
          </div>
          <div className="mb-3 w-80">
            <TextField
              label={t("search")}
              variant="search"
              size="sm"
              value={q}
              onChange={setQ}
              placeholder={t("searchPlaceholder")}
              className="[&>label]:sr-only"
            />
          </div>
          <Table
            caption={t("caption")}
            columns={columns}
            rows={shown}
            rowKey={(d) => d.key}
            loading={loading}
            onRowClick={openDoc}
            rowActions={(d) => (
              <RowMenu
                label={t("rowActions")}
                items={[
                  {
                    key: "open",
                    label: t("open"),
                    icon: <ArrowUpRight size={16} strokeWidth={1.5} aria-hidden />,
                    onSelect: () => openDoc(d),
                  },
                ]}
              />
            )}
            emptyState={
              docs.length === 0 ? (
                <EmptyState icon={Database} title={t("list.emptyTitle")} description={t("list.emptyDescription")} />
              ) : (
                <NoResultsState onClearFilters={() => (setView("ALL"), setQ(""))} />
              )
            }
          />
        </>
      ) : null}
      {editor && editor.type !== "GOODS" ? (
        <FinanceDrawer
          id={editor.id}
          kind={editor.type}
          branchId={editor.branchId}
          branchName={branchName(editor.branchId)}
          onClose={() => setEditor(null)}
          onCreated={(id) => setEditor({ ...editor, id })}
        />
      ) : null}
    </>
  );
}
