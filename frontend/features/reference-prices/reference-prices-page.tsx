"use client";

import {
  ArrowLeft,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  FileDown,
  FileSpreadsheet,
  Link2,
  Save,
  Scale,
  TrendingDown,
  TrendingUp,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useRef, useState, type DragEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Select, type SelectOption } from "@/components/ui/select";
import { EmptyState, ErrorState, ForbiddenState, NoResultsState } from "@/components/ui/system-states";
import { Table, type SortState, type TableColumn } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { usePriceTypes } from "@/features/counterparties/api";
import { useBranchList } from "@/features/organization/api";
import { searchPostedReceipts, searchProducts } from "@/features/prices/api";
import { autoMap, dataRows, mapFromProfile, profileFromMap, records, type Mapping } from "@/features/products/import-model";
import { describeError } from "@/features/setup/form-error";
import { formatDateTime, formatMoney, formatQuantity } from "@/lib/format";
import { useBranchStore } from "@/lib/stores/branch";
import {
  exportUrl,
  MAX_BYTES,
  PRICES_REFERENCE,
  readRefFile,
  saveRefProfile,
  useMatchLine,
  useRefCompare,
  useRefHistory,
  useRefProfile,
  useRunCompare,
  type CompareLine,
  type CompareMode,
  type CompareSummary,
  type RefFile,
} from "./api";
import { formatPct, guessHeader, RESULT_TABS, REF_FIELDS, visibleLines, type RefField, type ResultTab } from "./model";

const TAB_ICON: Record<ResultTab, LucideIcon> = { DEARER: TrendingUp, CHEAPER: TrendingDown, MATCH: CircleCheck, NOT_FOUND: CircleHelp };

export function ReferencePricesPage() {
  const t = useTranslations("referencePrices");
  const me = useMe();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const idParam = Number(params.get("id"));
  const openId = Number.isFinite(idParam) && idParam > 0 ? idParam : null;
  const [file, setFile] = useState<{ data: RefFile; raw: File } | null>(null);

  if (me.data && !can(me.data, PRICES_REFERENCE)) return <ForbiddenState />;

  const go = (q: string) => router.push(q ? `${pathname}?${q}` : pathname);

  if (openId) return <ResultView id={openId} onBack={() => go("")} />;
  if (file)
    return (
      <Wizard
        file={file.data}
        presetMode={params.get("mode") === "PURCHASE" ? "PURCHASE" : null}
        presetReceipt={Number(params.get("receiptId")) || null}
        onCancel={() => setFile(null)}
        onDone={(id) => {
          setFile(null);
          go(`id=${id}`);
        }}
      />
    );
  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-page-title">{t("title")}</h1>
          <p className="text-caption text-text-secondary">{t("subtitle")}</p>
        </div>
      </div>
      <UploadBox onFile={(data, raw) => setFile({ data, raw })} />
      <History onOpen={(id) => go(`id=${id}`)} />
    </>
  );
}

// ===== Fayl yuklash =====

function UploadBox({ onFile }: { onFile: (f: RefFile, raw: File) => void }) {
  const t = useTranslations("referencePrices");
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function handle(f: File | undefined) {
    if (!f) return;
    const ext = (f.name.split(".").pop() ?? "").toLowerCase();
    if (!["xlsx", "xls", "csv"].includes(ext)) return setErr(t("e.type"));
    if (f.size > MAX_BYTES) return setErr(t("e.size"));
    setErr("");
    setBusy(true);
    try {
      onFile(await readRefFile(f), f);
    } catch (e) {
      setErr(describeError(e).message ?? t("e.read"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-6">
      <div
        role="button"
        tabIndex={0}
        aria-label={t("upload")}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
        onDragOver={(e: DragEvent) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e: DragEvent) => {
          e.preventDefault();
          setDrag(false);
          void handle(e.dataTransfer.files[0]);
        }}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-card border-2 border-dashed px-6 py-8 text-center ${
          drag ? "border-primary bg-primary-soft" : "border-border bg-surface hover:bg-background"
        }`}
      >
        <FileSpreadsheet size={32} strokeWidth={1.5} aria-hidden className="text-text-secondary" />
        <div className="font-medium">{t("dropTitle")}</div>
        <div className="text-caption text-text-secondary">{t("dropHint")}</div>
        <Button icon={Upload} loading={busy} onClick={(e) => (e.stopPropagation(), input.current?.click())}>
          {t("upload")}
        </Button>
        <input
          ref={input}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          data-testid="ref-file"
          onChange={(e) => {
            void handle(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      {err ? (
        <Alert tone="danger" title={t("e.title")} className="mt-3">
          {err}
        </Alert>
      ) : null}
    </div>
  );
}

// ===== Tarix =====

function useModeText(): (s: CompareSummary) => string {
  const t = useTranslations("referencePrices");
  return (s) => {
    if (s.mode === "SALE") return t("modeSaleOf", { type: s.priceType ?? "—" });
    return s.receiptNumber ? t("modePurchaseOf", { doc: s.receiptNumber }) : t("modePurchaseLast");
  };
}

function History({ onOpen }: { onOpen: (id: number) => void }) {
  const t = useTranslations("referencePrices");
  const list = useRefHistory(null);
  const modeText = useModeText();
  const columns: TableColumn<CompareSummary>[] = [
    { key: "at", title: t("col.at"), width: 150, render: (s) => formatDateTime(new Date(s.createdAt)) },
    { key: "file", title: t("col.file"), wrap: true, render: (s) => s.fileName },
    { key: "mode", title: t("col.mode"), wrap: true, render: (s) => modeText(s) },
    { key: "branch", title: t("col.branch"), render: (s) => s.branch },
    {
      key: "dearer",
      title: t("tab.DEARER"),
      align: "right",
      render: (s) => <span className="text-danger">{formatQuantity(s.dearer)}</span>,
    },
    { key: "cheaper", title: t("tab.CHEAPER"), align: "right", render: (s) => formatQuantity(s.cheaper) },
    { key: "matched", title: t("tab.MATCH"), align: "right", render: (s) => formatQuantity(s.matched) },
    { key: "notFound", title: t("tab.NOT_FOUND"), align: "right", render: (s) => formatQuantity(s.notFound) },
    { key: "by", title: t("col.by"), render: (s) => s.createdBy },
  ];
  return (
    <>
      <h2 className="mb-2 text-section-title">{t("history")}</h2>
      {list.error ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : (
        <Table
          caption={t("history")}
          columns={columns}
          rows={list.data ?? []}
          rowKey={(s) => String(s.id)}
          loading={list.isPending}
          onRowClick={(s) => onOpen(s.id)}
          emptyState={<EmptyState icon={Scale} title={t("emptyTitle")} description={t("emptyDesc")} />}
        />
      )}
    </>
  );
}

// ===== Moslash va solishtirish sozlamalari =====

function Wizard({
  file,
  presetMode,
  presetReceipt,
  onCancel,
  onDone,
}: {
  file: RefFile;
  presetMode: CompareMode | null;
  presetReceipt: number | null;
  onCancel: () => void;
  onDone: (id: number) => void;
}) {
  const t = useTranslations("referencePrices");
  const me = useMe();
  const branches = useBranchList();
  const selectedBranch = useBranchStore((s) => s.branchId);
  const types = usePriceTypes();
  const profile = useRefProfile();
  const run = useRunCompare();
  const costVisible = can(me.data, "prices.cost") || can(me.data, "special.cost");

  const firstSheet = Math.max(
    0,
    file.sheets.findIndex((s) => s.rows.length > 0),
  );
  const [sheet, setSheet] = useState(firstSheet);
  const grid = useMemo(() => file.sheets[sheet]?.rows ?? [], [file, sheet]);
  const [hdr, setHdr] = useState(() => guessHeader(file.sheets[firstSheet]?.rows ?? []));
  const headers = useMemo(() => (grid[hdr - 1] ?? []).map((h) => String(h ?? "")), [grid, hdr]);
  const [map, setMap] = useState<Mapping<RefField> | null>(null);
  const fromProfile = profile.data ? mapFromProfile<RefField>(profile.data.mapping, headers, REF_FIELDS) : {};
  const effective: Mapping<RefField> = map ?? (Object.keys(fromProfile).length ? fromProfile : autoMap(REF_FIELDS, headers));
  const rows = useMemo(() => dataRows(grid, hdr), [grid, hdr]);

  const [mode, setMode] = useState<CompareMode>(presetMode === "PURCHASE" && costVisible ? "PURCHASE" : costVisible ? "PURCHASE" : "SALE");
  const [priceTypeId, setPriceTypeId] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(presetReceipt ? String(presetReceipt) : null);
  const allBranches = Boolean(me.data?.allBranches);
  const [branch, setBranch] = useState<string | null>(
    me.data?.allBranches ? (selectedBranch ? String(selectedBranch) : null) : me.data?.branchId ? String(me.data.branchId) : null,
  );
  const [err, setErr] = useState("");

  const colOptions: SelectOption[] = headers.map((h, i) => ({ value: String(i), label: h.trim() || t("colN", { n: i + 1 }) }));
  const typeOptions: SelectOption[] = (types.data ?? []).filter((x) => !x.batch).map((x) => ({ value: String(x.id), label: x.name }));
  const branchOptions: SelectOption[] = (branches.data ?? []).filter((b) => b.active).map((b) => ({ value: String(b.id), label: b.name }));
  const missing = REF_FIELDS.filter((f) => f.req && effective[f.key] == null);

  function submit() {
    if (missing.length) return setErr(t("e.required", { f: missing.map((f) => t(`f.${f.key}`)).join(", ") }));
    if (mode === "SALE" && !priceTypeId) return setErr(t("e.priceType"));
    if (allBranches && !branch && !receipt) return setErr(t("e.branch"));
    setErr("");
    run.mutate(
      {
        fileName: file.fileName,
        mode,
        branchId: branch ? Number(branch) : undefined,
        priceTypeId: mode === "SALE" ? Number(priceTypeId) : undefined,
        receiptId: mode === "PURCHASE" && receipt ? Number(receipt) : undefined,
        rows: records(grid, hdr, effective, {}),
      },
      {
        onSuccess: (d) => {
          if (d.skippedRows.length) toast({ tone: "warning", title: t("skipped", { n: d.skippedRows.length }) });
          onDone(d.summary.id);
        },
        onError: (e) => setErr(describeError(e).message ?? t("e.compare")),
      },
    );
  }

  async function saveProfile() {
    try {
      await saveRefProfile(file.fileName, profileFromMap(effective, headers));
      await profile.refetch();
      toast({ tone: "success", title: t("profileSaved") });
    } catch (e) {
      toast({ tone: "danger", title: describeError(e).message ?? t("e.compare") });
    }
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-page-title">{t("wizardTitle")}</h1>
          <p className="text-caption text-text-secondary">{t("wizardSub", { file: file.fileName, n: formatQuantity(rows.length) })}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onCancel}>
            {t("cancel")}
          </Button>
          <Button icon={Scale} loading={run.isPending} onClick={submit}>
            {t("compare")}
          </Button>
        </div>
      </div>
      {err ? (
        <Alert tone="danger" title={t("e.title")} className="mb-4">
          {err}
        </Alert>
      ) : null}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card
          title={t("mapTitle")}
          actions={
            <Button variant="tertiary" size="sm" icon={Save} onClick={() => void saveProfile()}>
              {t("saveProfile")}
            </Button>
          }
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {file.sheets.length > 1 ? (
              <Select
                label={t("sheet")}
                value={String(sheet)}
                onChange={(v) => {
                  const s = Number(v ?? 0);
                  setSheet(s);
                  setHdr(guessHeader(file.sheets[s]?.rows ?? []));
                  setMap(null);
                }}
                options={file.sheets.map((s, i) => ({ value: String(i), label: s.name }))}
              />
            ) : null}
            <Select
              label={t("headerRow")}
              value={String(hdr)}
              onChange={(v) => {
                setHdr(Number(v ?? 1));
                setMap(null);
              }}
              options={grid
                .slice(0, 10)
                .map((r, i) => ({ value: String(i + 1), label: `${i + 1}: ${r.filter(Boolean).slice(0, 3).join(" · ")}` }))}
            />
            {REF_FIELDS.map((f) => (
              <Select
                key={f.key}
                label={t(`f.${f.key}`)}
                required={f.req}
                placeholder={t("notMapped")}
                value={effective[f.key] != null ? String(effective[f.key]) : null}
                onChange={(v) => setMap({ ...effective, [f.key]: v == null ? undefined : Number(v) })}
                options={colOptions}
                hint={f.key === "price" ? t("priceHint") : undefined}
              />
            ))}
          </div>
          {profile.data && map == null && Object.keys(fromProfile).length ? (
            <p className="mt-3 text-caption text-text-secondary">{t("profileApplied", { p: profile.data.name })}</p>
          ) : null}
        </Card>
        <Card title={t("withTitle")}>
          <div className="grid grid-cols-1 gap-3">
            <Select
              label={t("mode")}
              required
              value={mode}
              onChange={(v) => setMode(v === "PURCHASE" ? "PURCHASE" : "SALE")}
              options={[
                ...(costVisible ? [{ value: "PURCHASE", label: t("modePurchase"), sub: t("modePurchaseSub") }] : []),
                { value: "SALE", label: t("modeSale"), sub: t("modeSaleSub") },
              ]}
            />
            {mode === "SALE" ? (
              <Select
                label={t("priceType")}
                required
                value={priceTypeId}
                onChange={setPriceTypeId}
                options={typeOptions}
                loading={types.isPending}
              />
            ) : (
              <Select
                label={t("receipt")}
                placeholder={t("receiptLast")}
                hint={t("receiptHint")}
                value={receipt}
                onChange={setReceipt}
                options={receipt ? [{ value: receipt, label: t("receiptN", { id: receipt }) }] : []}
                searchable
                loadOptions={(q) => searchPostedReceipts(Number(branch ?? me.data?.branchId ?? 0), q)}
              />
            )}
            {allBranches ? <Select label={t("branch")} required value={branch} onChange={setBranch} options={branchOptions} /> : null}
            {!costVisible ? <p className="text-caption text-text-secondary">{t("costHiddenNote")}</p> : null}
          </div>
        </Card>
      </div>
    </>
  );
}

// ===== Natija =====

function StatusBadge({ line }: { line: CompareLine }) {
  const t = useTranslations("referencePrices");
  switch (line.status) {
    case "DEARER":
      return (
        <Badge tone="danger" icon={TrendingUp}>
          {t("tab.DEARER")}
        </Badge>
      );
    case "CHEAPER":
      return (
        <Badge tone="warning" icon={TrendingDown}>
          {t("tab.CHEAPER")}
        </Badge>
      );
    case "MATCH":
      return (
        <Badge tone="success" icon={CircleCheck}>
          {t("tab.MATCH")}
        </Badge>
      );
    case "NO_PRICE":
      return (
        <Badge tone="neutral" icon={CircleHelp}>
          {t("noPrice")}
        </Badge>
      );
    default:
      return (
        <Badge tone="neutral" icon={CircleHelp}>
          {t("tab.NOT_FOUND")}
        </Badge>
      );
  }
}

function ResultView({ id, onBack }: { id: number; onBack: () => void }) {
  const t = useTranslations("referencePrices");
  const q = useRefCompare(id);
  const modeText = useModeText();
  const [tab, setTab] = useState<ResultTab>("DEARER");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState | undefined>({ key: "diffPct", dir: "desc" });
  const [matching, setMatching] = useState<CompareLine | null>(null);

  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  const s = d?.summary;
  const counts: Record<ResultTab, number> = {
    DEARER: s?.dearer ?? 0,
    CHEAPER: s?.cheaper ?? 0,
    MATCH: s?.matched ?? 0,
    NOT_FOUND: s?.notFound ?? 0,
  };
  const lines = d ? visibleLines(d.lines, tab, query, sort?.key === "diffPct" ? sort.dir : null) : [];
  const toCheck = (d?.lines ?? []).filter((l) => !l.confident).length;

  const columns: TableColumn<CompareLine>[] = [
    { key: "row", title: t("col.row"), width: 64, align: "right", render: (l) => l.rowNo },
    {
      key: "name",
      title: t("col.fileName"),
      wrap: true,
      render: (l) => (
        <div>
          <div>{l.name}</div>
          {l.manufacturer ? <div className="text-caption text-text-secondary">{l.manufacturer}</div> : null}
        </div>
      ),
    },
    {
      key: "product",
      title: t("col.product"),
      wrap: true,
      render: (l) =>
        l.productId ? (
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span>{l.productName}</span>
              {!l.confident ? (
                <Badge tone="warning" icon={CircleAlert}>
                  {t("check")}
                </Badge>
              ) : null}
            </div>
            <div className="text-caption text-text-secondary">
              <span className="font-mono">{l.productCode}</span>
              {l.productMaker ? ` · ${l.productMaker}` : ""} · {t(`by.${l.matchBy}`)}
            </div>
          </div>
        ) : (
          <span className="text-text-secondary">—</span>
        ),
    },
    { key: "our", title: t("col.our"), align: "right", render: (l) => (l.ourPrice ? formatMoney(l.ourPrice) : "—") },
    { key: "ref", title: t("col.ref"), align: "right", render: (l) => formatMoney(l.refPrice) },
    {
      key: "diff",
      title: t("col.diff"),
      align: "right",
      render: (l) => (l.diff ? formatMoney(l.diff.startsWith("-") ? l.diff.slice(1) : l.diff) : "—"),
    },
    {
      key: "diffPct",
      title: t("col.diffPct"),
      align: "right",
      sortable: true,
      render: (l) => (
        <span className={l.status === "DEARER" ? "font-medium text-danger" : l.status === "CHEAPER" ? "text-warning" : undefined}>
          {formatPct(l.diffPct)}
        </span>
      ),
    },
    { key: "source", title: t("col.source"), render: (l) => l.source ?? "—" },
    { key: "status", title: t("col.status"), render: (l) => <StatusBadge line={l} /> },
  ];

  return (
    <>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <Button variant="tertiary" size="sm" icon={ArrowLeft} onClick={onBack}>
            {t("back")}
          </Button>
          <h1 className="mt-1 text-page-title">{s ? s.fileName : t("title")}</h1>
          {s ? (
            <p className="text-caption text-text-secondary">
              {t("resultSub", {
                at: formatDateTime(new Date(s.createdAt)),
                by: s.createdBy,
                mode: modeText(s),
                tol: s.tolerancePct,
                branch: s.branch,
              })}
            </p>
          ) : null}
        </div>
        <a
          href={exportUrl(id)}
          download
          className="inline-flex h-control-md items-center gap-2 rounded-control border border-border bg-surface px-4 font-medium hover:bg-background"
        >
          <FileDown size={16} strokeWidth={1.5} aria-hidden />
          {t("exportAll")}
        </a>
      </div>
      {toCheck ? (
        <Alert tone="warning" title={t("toCheckTitle", { n: toCheck })} className="mb-4">
          {t("toCheckDesc")}
        </Alert>
      ) : null}
      <Tabs
        items={RESULT_TABS.map((k) => ({ key: k, label: t(`tab.${k}`), count: counts[k], icon: TAB_ICON[k] }))}
        value={tab}
        onChange={(k) => setTab(k as ResultTab)}
        aria-label={t("tabsLabel")}
      />
      <div className="mt-4">
        <Table
          caption={t(`tab.${tab}`)}
          columns={columns}
          rows={lines}
          rowKey={(l) => String(l.rowNo)}
          loading={q.isPending}
          sort={sort}
          onSortChange={setSort}
          rowActions={(l) => (
            <Button variant="tertiary" size="sm" icon={Link2} onClick={() => setMatching(l)}>
              {l.productId ? t("rematch") : t("match")}
            </Button>
          )}
          toolbar={
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-80">
                <TextField label={t("search")} variant="search" size="sm" value={query} onChange={setQuery} />
              </div>
              <a
                href={exportUrl(id, tab)}
                download
                className="inline-flex h-control-sm items-center gap-2 rounded-control border border-border bg-surface px-3 font-medium hover:bg-background"
              >
                <FileDown size={16} strokeWidth={1.5} aria-hidden />
                {t("exportTab")}
              </a>
            </div>
          }
          emptyState={
            query ? (
              <NoResultsState onClearFilters={() => setQuery("")} />
            ) : (
              <EmptyState icon={TAB_ICON[tab]} title={t("tabEmptyTitle")} description={t(`tabEmpty.${tab}`)} />
            )
          }
        />
      </div>
      {matching ? <MatchModal compareId={id} line={matching} onClose={() => setMatching(null)} /> : null}
    </>
  );
}

function MatchModal({ compareId, line, onClose }: { compareId: number; line: CompareLine; onClose: () => void }) {
  const t = useTranslations("referencePrices");
  const [product, setProduct] = useState<string | null>(line.productId ? String(line.productId) : null);
  const [err, setErr] = useState("");
  const m = useMatchLine(compareId);
  return (
    <Modal
      open
      onClose={onClose}
      title={t("matchTitle")}
      primaryAction={{
        label: t("matchSave"),
        loading: m.isPending,
        disabled: !product,
        onClick: () =>
          m.mutate(
            { rowNo: line.rowNo, productId: Number(product) },
            {
              onSuccess: () => {
                toast({ tone: "success", title: t("matched") });
                onClose();
              },
              onError: (e) => setErr(describeError(e).message ?? t("e.compare")),
            },
          ),
      }}
      secondaryAction={{ label: t("cancel"), onClick: onClose }}
    >
      <p className="mb-3 text-body">
        {t("matchFor", { name: line.name })} — {formatMoney(line.refPrice)}
      </p>
      <Select
        label={t("col.product")}
        required
        searchable
        value={product}
        onChange={setProduct}
        options={
          line.productId ? [{ value: String(line.productId), label: line.productName ?? "", sub: line.productCode ?? undefined }] : []
        }
        loadOptions={searchProducts}
        hint={t("matchHint")}
      />
      {err ? (
        <Alert tone="danger" title={t("e.title")} className="mt-3">
          {err}
        </Alert>
      ) : null}
    </Modal>
  );
}
