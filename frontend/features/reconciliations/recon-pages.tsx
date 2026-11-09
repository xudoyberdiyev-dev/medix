"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowUpRight, CircleCheck, FileCheck2, Plus, Printer, Send, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MultiFilter } from "@/components/ui/multi-filter";
import { Select } from "@/components/ui/select";
import { EmptyState, ErrorState, ForbiddenState, Skeleton } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { formatIsoDate, parseUzDate, todayTashkent } from "@/features/counterparties/api";
import { useBranches } from "@/features/employees/api";
import { searchCustomers } from "@/features/orders/api";
import { searchSuppliers } from "@/features/receipts/api";
import { api, ApiError, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { cn } from "@/lib/cn";
import { formatMoney, formatQuantity } from "@/lib/format";
import { useBranchStore } from "@/lib/stores/branch";
import {
  canStep,
  diffAmount,
  favor,
  filterRecons,
  quickPeriods,
  RECON_TABS,
  tabCounts,
  type ReconSide,
  type ReconStatus,
  type ReconTab,
} from "./model";

type ReconRow = components["schemas"]["ReconRow"];
type ReconDetail = components["schemas"]["ReconDetail"];

const STATUS: Record<ReconStatus, { tone: Tone; icon: LucideIcon }> = {
  MADE: { tone: "info", icon: FileCheck2 },
  SENT: { tone: "warning", icon: Send },
  SIGNED: { tone: "success", icon: CircleCheck },
  DIFF: { tone: "danger", icon: AlertTriangle },
};

const DOC_TYPES = ["SV", "KR", "MT", "YT", "QM", "QY", "AH", "BQ"] as const;
const isDocType = (v: string): v is (typeof DOC_TYPES)[number] => (DOC_TYPES as readonly string[]).includes(v);

const errText = (e: unknown) => (e instanceof ApiError ? e.message : String(e));

function StatusBadge({ status }: { status: ReconStatus }) {
  const t = useTranslations("reconciliations");
  return (
    <Badge tone={STATUS[status].tone} icon={STATUS[status].icon}>
      {t(`status.${status}`)}
    </Badge>
  );
}

/** Akt sverka roʻyxati (prototip `Reconciliation`): yorliqlar holat boʻyicha, qidiruv, Kontragent turi filtri, jadval. */
export function ReconListPage() {
  const t = useTranslations("reconciliations");
  const me = useMe();
  const router = useRouter();
  const selectedBranch = useBranchStore((s) => s.branchId);
  const allBranches = !!me.data?.allBranches && selectedBranch == null;
  const branchId = me.data?.allBranches ? (selectedBranch ?? undefined) : undefined;
  const allowed = can(me.data, "recon.view");
  const q = useQuery({
    enabled: allowed,
    queryKey: ["reconciliations", branchId ?? null],
    queryFn: () => unwrap(api.GET("/api/reconciliations", { params: { query: { branchId } } })),
  });
  const [tab, setTab] = useState<ReconTab>("all");
  const [sides, setSides] = useState<ReconSide[]>([]);
  const [search, setSearch] = useState("");

  if (me.data && !allowed) return <ForbiddenState description={t("forbidden")} />;
  const all = q.data?.rows ?? [];
  const counts = tabCounts(all);
  const rows = filterRecons(all, { tab, sides, q: search });
  const filtered = tab !== "all" || sides.length > 0 || search.trim() !== "";

  const columns: TableColumn<ReconRow>[] = [
    { key: "number", title: t("col.number"), mono: true, width: 150 },
    {
      key: "party",
      title: t("col.party"),
      wrap: true,
      render: (r) => (
        <div className="flex flex-col">
          <span className="font-medium">{r.counterparty}</span>
          <span className="text-caption text-text-secondary">{t(`side.${r.side}`)}</span>
        </div>
      ),
    },
    ...(allBranches
      ? [{ key: "branch", title: t("col.branch"), render: (r: ReconRow) => <span className="text-text-secondary">{r.branch}</span> }]
      : []),
    {
      key: "period",
      title: t("col.period"),
      render: (r) => <span className="text-text-secondary">{`${formatIsoDate(r.from)} – ${formatIsoDate(r.to)}`}</span>,
    },
    {
      key: "closing",
      title: t("col.final"),
      align: "right",
      render: (r) => <span className="font-semibold tabular-nums">{formatMoney(r.closing)}</span>,
    },
    { key: "status", title: t("col.status"), render: (r) => <StatusBadge status={r.status} /> },
    { key: "by", title: t("col.by"), render: (r) => <span className="text-text-secondary">{r.createdBy}</span> },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="flex items-baseline gap-2 text-page-title">
          {t("title")}
          {q.data ? <span className="tabular text-body text-text-secondary">{formatQuantity(all.length)}</span> : null}
        </h1>
        {can(me.data, "recon.create") ? (
          <Button icon={Plus} onClick={() => router.push("/reconciliations/new")}>
            {t("create")}
          </Button>
        ) : null}
      </div>
      <div className="flex flex-col gap-3">
        <Tabs
          aria-label={t("tabsLabel")}
          value={tab}
          onChange={(k) => setTab(k as ReconTab)}
          items={RECON_TABS.map((k) => ({ key: k, label: k === "all" ? t("all") : t(`status.${k}`), count: counts[k] }))}
        />
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-full max-w-sm">
            <TextField label={t("search")} variant="search" size="sm" value={search} onChange={setSearch} placeholder={t("search")} />
          </div>
          <MultiFilter
            label={t("kind")}
            options={(["CUSTOMER", "SUPPLIER"] as const).map((v) => ({
              value: v,
              label: t(`side.${v}`),
              count: all.filter((r) => r.side === v).length,
            }))}
            selected={sides}
            onChange={setSides}
          />
          {filtered ? (
            <Button
              variant="tertiary"
              size="sm"
              onClick={() => {
                setTab("all");
                setSides([]);
                setSearch("");
              }}
            >
              {t("clearFilters")}
            </Button>
          ) : null}
        </div>
      </div>
      <div className="min-w-0 rounded-card border border-border bg-surface">
        {q.error ? (
          <ErrorState onRetry={() => q.refetch()} />
        ) : (
          <Table
            caption={t("title")}
            columns={columns}
            rows={rows}
            rowKey={(r) => String(r.id)}
            loading={allowed && q.isPending}
            onRowClick={(r) => router.push(`/reconciliations/${r.id}`)}
            rowActions={(r) => (
              <Link href={`/reconciliations/${r.id}`} className="inline-flex items-center gap-1 text-table text-primary hover:underline">
                <ArrowUpRight size={14} strokeWidth={1.5} aria-hidden />
                {t("open")}
              </Link>
            )}
            emptyState={
              filtered && all.length > 0 ? (
                <EmptyState icon={FileCheck2} title={t("noMatchTitle")} description={t("noMatchDescription")} />
              ) : (
                <EmptyState icon={FileCheck2} title={t("emptyTitle")} description={t("emptyDescription")} />
              )
            }
          />
        )}
      </div>
    </div>
  );
}

/** Yangi akt sverka: kontragent turi, kontragent, filial, davr (tezkor tanlov), oldindan hisob. */
export function ReconNewPage() {
  const t = useTranslations("reconciliations");
  const me = useMe();
  const router = useRouter();
  const qc = useQueryClient();
  const branches = useBranches();
  const selectedBranch = useBranchStore((s) => s.branchId);
  const today = todayTashkent();
  const quick = quickPeriods(today);
  const params = useSearchParams();
  const initParty =
    Number(params.get("party")) > 0 ? { value: String(Number(params.get("party"))), label: params.get("name") ?? "" } : null;
  const [side, setSide] = useState<ReconSide>(params.get("side") === "SUPPLIER" ? "SUPPLIER" : "CUSTOMER");
  const [party, setParty] = useState<string | null>(initParty?.value ?? null);
  const [partyErr, setPartyErr] = useState<string | undefined>();
  const [branch, setBranch] = useState<string | null>(Number(params.get("branch")) > 0 ? String(Number(params.get("branch"))) : null);
  const [from, setFrom] = useState(formatIsoDate(quick.month[0]));
  const [to, setTo] = useState(formatIsoDate(quick.month[1]));
  const isoFrom = parseUzDate(from);
  const isoTo = parseUzDate(to);
  const branchId = Number(branch ?? (me.data?.allBranches ? selectedBranch : me.data?.branchId) ?? 0) || null;
  const partyId = party ? Number(party) : null;
  const preview = useQuery({
    queryKey: ["reconciliations", "preview", side, partyId, branchId, isoFrom, isoTo],
    enabled: partyId != null && branchId != null && !!isoFrom && !!isoTo,
    queryFn: () => {
      const params = {
        path: { id: partyId as number },
        query: { branchId: branchId as number, from: isoFrom ?? undefined, to: isoTo ?? undefined },
      };
      return side === "CUSTOMER"
        ? unwrap(api.GET("/api/debts/customers/{id}/act", { params }))
        : unwrap(api.GET("/api/debts/suppliers/{id}/act", { params }));
    },
  });
  const create = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST("/api/reconciliations", {
          body: { side, counterpartyId: partyId as number, branchId: branchId as number, from: isoFrom as string, to: isoTo as string },
        }),
      ),
    onSuccess: async (d) => {
      await qc.invalidateQueries({ queryKey: ["reconciliations"] });
      toast({ tone: "success", title: t("new.made", { n: d.head.number }) });
      router.push(`/reconciliations/${d.head.id}`);
    },
    onError: (e) => toast({ tone: "danger", title: errText(e) }),
  });

  if (me.data && !can(me.data, "recon.create")) return <ForbiddenState description={t("forbidden")} />;
  const submit = () => {
    if (partyId == null) {
      setPartyErr(t("new.partyRequired"));
      return;
    }
    if (!isoFrom || !isoTo || branchId == null) return;
    create.mutate();
  };
  const branchOpts = (branches.data ?? []).map((b) => ({ value: String(b.id), label: b.name }));

  return (
    <div className="flex min-w-0 max-w-[880px] flex-col gap-4">
      <nav className="flex items-center gap-1.5 text-caption">
        <Link href="/reconciliations" className="text-primary hover:underline">
          {t("title")}
        </Link>
        <span className="text-text-secondary">/</span>
        <span className="text-text-secondary">{t("new.title")}</span>
      </nav>
      <h1 className="text-page-title">{t("new.title")}</h1>
      <div className="flex flex-col gap-5 rounded-card border border-border bg-surface px-6 py-5">
        <div className="flex flex-col gap-1.5">
          <span className="text-table font-medium">{t("kind")}</span>
          <div className="inline-flex gap-0.5 self-start rounded-control bg-table-header p-0.5" role="group" aria-label={t("kind")}>
            {(["CUSTOMER", "SUPPLIER"] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={side === k}
                onClick={() => {
                  setSide(k);
                  setParty(null);
                }}
                className={cn(
                  "h-[30px] rounded-[6px] px-3.5 text-table font-medium",
                  side === k ? "bg-surface text-primary shadow-sm" : "text-text-secondary hover:text-text-primary",
                )}
              >
                {t(`side.${k}`)}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Select
            key={side}
            label={t(`new.party.${side}`)}
            required
            searchable
            options={initParty && party === initParty.value ? [initParty] : []}
            loadOptions={side === "CUSTOMER" ? searchCustomers : searchSuppliers}
            placeholder={t("new.pick")}
            value={party}
            onChange={(v) => {
              setParty(v);
              setPartyErr(undefined);
            }}
            error={partyErr}
          />
          <Select
            label={t("new.branch")}
            required
            options={branchOpts}
            value={branchId != null ? String(branchId) : null}
            onChange={setBranch}
            disabled={!me.data?.allBranches}
          />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-table font-medium">
            {t("new.period")} <span className="text-danger">*</span>
          </span>
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-36">
              <TextField
                label={t("new.from")}
                size="sm"
                value={from}
                onChange={setFrom}
                error={isoFrom === null ? t("new.badDate") : undefined}
              />
            </div>
            <div className="w-36">
              <TextField label={t("new.to")} size="sm" value={to} onChange={setTo} error={isoTo === null ? t("new.badDate") : undefined} />
            </div>
            {(["month", "lastMonth", "lastQ", "ytd"] as const).map((k) => {
              const on = isoFrom === quick[k][0] && isoTo === quick[k][1];
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setFrom(formatIsoDate(quick[k][0]));
                    setTo(formatIsoDate(quick[k][1]));
                  }}
                  className={cn(
                    "h-7 rounded-full border px-2.5 text-caption font-medium",
                    on
                      ? "border-primary bg-primary-soft text-primary"
                      : "border-border bg-surface text-text-primary hover:border-text-secondary",
                  )}
                >
                  {t(`new.quick.${k}`)}
                </button>
              );
            })}
          </div>
        </div>
        {preview.data ? (
          <dl className="grid grid-cols-2 gap-3 rounded-control border border-border bg-table-header px-3.5 py-3 md:grid-cols-4">
            <PreviewCell label={t("new.opening")} value={preview.data.opening} />
            <PreviewCell label={t("col.debit")} value={preview.data.debitTotal} />
            <PreviewCell label={t("col.credit")} value={preview.data.creditTotal} />
            <PreviewCell label={t("new.closing")} value={preview.data.closing} strong />
          </dl>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
          <Button variant="secondary" onClick={() => router.push("/reconciliations")}>
            {t("view.cancel")}
          </Button>
          <Button icon={FileCheck2} loading={create.isPending} onClick={submit}>
            {t("new.submit")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function PreviewCell(props: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-caption text-text-secondary">{props.label}</dt>
      <dd className={cn("whitespace-nowrap tabular-nums", props.strong ? "font-semibold" : "font-medium")}>{formatMoney(props.value)}</dd>
    </div>
  );
}

/** Akt sverka varagʻi: sarlavha, holat tugmalari, farq bloki, dalolatnoma (ikki tomon, qatorlar, yakun, imzolar). */
export function ReconViewPage({ id }: { id: number }) {
  const t = useTranslations("reconciliations");
  const me = useMe();
  const qc = useQueryClient();
  const q = useQuery({
    enabled: can(me.data, "recon.view"),
    queryKey: ["reconciliations", "one", id],
    queryFn: () => unwrap(api.GET("/api/reconciliations/{id}", { params: { path: { id } } })),
  });
  const [diffOpen, setDiffOpen] = useState(false);
  const [theirs, setTheirs] = useState("");
  const [note, setNote] = useState("");
  const [errs, setErrs] = useState<{ theirs?: string; note?: string }>({});
  const step = useMutation({
    mutationFn: (body: components["schemas"]["ReconStatusRequest"]) =>
      unwrap(api.POST("/api/reconciliations/{id}/status", { params: { path: { id } }, body })),
    onSuccess: (d) => {
      qc.setQueryData(["reconciliations", "one", id], d);
      void qc.invalidateQueries({ queryKey: ["reconciliations"], exact: false });
      setDiffOpen(false);
      toast({ tone: "success", title: t("view.stepDone", { s: t(`status.${d.head.status}`) }) });
    },
    onError: (e) => toast({ tone: "danger", title: errText(e) }),
  });

  if (me.data && !can(me.data, "recon.view")) return <ForbiddenState description={t("forbidden")} />;
  if (q.error) return <ErrorState onRetry={() => q.refetch()} />;
  if (!q.data) return <Skeleton className="h-96" />;
  const d: ReconDetail = q.data;
  const h = d.head;
  const canEdit = can(me.data, "recon.create");
  const guard = (to: "SENT" | "SIGNED" | "DIFF", run: () => void) => () => {
    if (!canStep(h.status, to)) {
      toast({ tone: "warning", title: t(to === "SENT" ? "view.needSent" : to === "SIGNED" ? "view.needSigned" : "view.needDiff") });
      return;
    }
    run();
  };
  const saveDiff = () => {
    const e = { theirs: theirs.trim() ? undefined : t("view.theirsRequired"), note: note.trim() ? undefined : t("view.noteRequired") };
    setErrs(e);
    if (e.theirs || e.note) return;
    step.mutate({ status: "DIFF", theirBalance: theirs, note: note.trim() });
  };
  const liveDiff = /^-?\d+\.\d{2}$/.test(theirs) ? diffAmount(theirs, h.closing) : null;
  const our = d.ourName;
  const favorText = (balance: string, dateIso: string) => {
    const f = favor(balance, h.side);
    const date = formatIsoDate(dateIso);
    if (f.zero) return t("view.zero", { d: date });
    return (
      t("view.favor", {
        d: date,
        who: f.debtorIsParty ? h.counterparty : our,
        to: f.debtorIsParty ? our : h.counterparty,
        s: formatMoney(f.abs),
      }) + (f.advance ? t("view.advance") : "")
    );
  };
  const dc = (v: string) => (v === "0.00" ? "" : formatMoney(v));
  // Medix nuqtai nazaridan: mijozga sotuv — debet; YB dan kirim — kredit (jurnalda musbat = qarz oshdi)
  const ourDebit = (l: { debit: string; credit: string }) => (h.side === "CUSTOMER" ? l.debit : l.credit);
  const ourCredit = (l: { debit: string; credit: string }) => (h.side === "CUSTOMER" ? l.credit : l.debit);
  const openNeg = d.act.opening.startsWith("-");
  const closeNeg = d.act.closing.startsWith("-");
  const absOf = (v: string) => (v.startsWith("-") ? v.slice(1) : v);
  const openOnDebit = h.side === "CUSTOMER" ? !openNeg : openNeg;
  const closeOnDebit = h.side === "CUSTOMER" ? !closeNeg : closeNeg;
  const dr = h.side === "CUSTOMER" ? d.act.debitTotal : d.act.creditTotal;
  const cr = h.side === "CUSTOMER" ? d.act.creditTotal : d.act.debitTotal;
  const savedDiff = h.status === "DIFF" && h.theirBalance ? diffAmount(h.theirBalance, h.closing) : null;
  const grid = "grid grid-cols-[92px_140px_minmax(160px,1fr)_112px_112px_92px_92px]";

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <nav className="flex items-center gap-1.5 text-caption">
            <Link href="/reconciliations" className="text-primary hover:underline">
              {t("title")}
            </Link>
            <span className="text-text-secondary">/</span>
            <span className="font-mono text-text-secondary">{h.number}</span>
          </nav>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-page-title">{h.counterparty}</h1>
            <StatusBadge status={h.status} />
          </div>
          <span className="text-table text-text-secondary">
            {`${t(`side.${h.side}`)} · ${h.branch} · ${formatIsoDate(h.from)} – ${formatIsoDate(h.to)} · ${h.createdBy}`}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit ? (
            <>
              <Button
                variant={h.status === "MADE" ? "primary" : "secondary"}
                icon={Send}
                loading={step.isPending && step.variables?.status === "SENT"}
                onClick={guard("SENT", () => step.mutate({ status: "SENT" }))}
              >
                {t("view.markSent")}
              </Button>
              <Button
                variant={h.status === "SENT" ? "primary" : "secondary"}
                icon={CircleCheck}
                loading={step.isPending && step.variables?.status === "SIGNED"}
                onClick={guard("SIGNED", () => step.mutate({ status: "SIGNED" }))}
              >
                {t("view.markSigned")}
              </Button>
              <Button
                variant="danger"
                icon={AlertTriangle}
                onClick={guard("DIFF", () => {
                  setTheirs(h.theirBalance ?? "");
                  setNote(h.diffNote ?? "");
                  setErrs({});
                  setDiffOpen(true);
                })}
              >
                {t("view.markDiff")}
              </Button>
            </>
          ) : null}
          <Button
            variant="secondary"
            icon={Printer}
            onClick={() =>
              window.open(
                `/api/debts/${h.side === "CUSTOMER" ? "customers" : "suppliers"}/${h.counterpartyId}/act/pdf?branchId=${h.branchId}&from=${h.from}&to=${h.to}`,
                "_blank",
                "noopener",
              )
            }
          >
            {t("view.print")}
          </Button>
        </div>
      </div>
      {h.status === "DIFF" && !diffOpen && h.theirBalance && savedDiff ? (
        <Alert tone="danger" title={t("view.diffBanner", { t: formatMoney(h.theirBalance), d: formatMoney(savedDiff) })}>
          {h.diffNote}
        </Alert>
      ) : null}
      {diffOpen ? (
        <section className="mx-auto flex w-full max-w-[880px] flex-col gap-3.5 rounded-card border border-danger bg-surface px-5 py-4">
          <span className="flex items-center gap-1.5 text-body font-semibold text-danger">
            <AlertTriangle size={16} strokeWidth={1.5} aria-hidden />
            {t("view.diffTitle")}
          </span>
          <div className="grid items-start gap-4 md:grid-cols-2">
            <TextField
              label={t("view.theirs")}
              variant="amount"
              suffix="soʻm"
              value={theirs}
              onChange={setTheirs}
              error={errs.theirs}
              required
            />
            <div className="flex flex-col gap-1">
              <span className="text-table font-medium text-text-secondary">{t("view.diffSum")}</span>
              <span
                className={cn("text-[20px] font-semibold leading-9", liveDiff && liveDiff !== "0.00" ? "text-danger" : "text-text-primary")}
              >
                {liveDiff ? formatMoney(liveDiff) : "—"}
              </span>
              <span className="text-caption text-text-secondary">{t("view.sysSame")}</span>
            </div>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-table font-medium">
              {t("view.note")} <span className="text-danger">*</span>
            </span>
            <textarea
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                setErrs((x) => ({ ...x, note: undefined }));
              }}
              rows={2}
              maxLength={500}
              placeholder={t("view.notePlaceholder")}
              className={cn(
                "resize-y rounded-control border px-2.5 py-2 text-table outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/20",
                errs.note ? "border-danger" : "border-border",
              )}
            />
            {errs.note ? <span className="text-caption text-danger">{errs.note}</span> : null}
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setDiffOpen(false)}>
              {t("view.cancel")}
            </Button>
            <Button variant="danger" size="sm" loading={step.isPending} onClick={saveDiff}>
              {t("view.saveDiff")}
            </Button>
          </div>
        </section>
      ) : null}
      <article className="mx-auto flex w-full max-w-[880px] flex-col gap-[22px] rounded-[4px] border border-border bg-surface px-5 py-6 text-table shadow-sm md:px-11 md:py-10">
        <header className="flex flex-col items-center gap-1 text-center">
          <h2 className="text-[17px] font-semibold leading-6">{t("view.sheetTitle")}</h2>
          <span className="text-text-secondary">{t("view.period", { a: formatIsoDate(h.from), b: formatIsoDate(h.to) })}</span>
          <span className="font-mono text-caption text-text-secondary">{`№ ${h.number} · ${formatIsoDate(h.createdAt.slice(0, 10))}`}</span>
        </header>
        <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
          {[
            { role: t("view.side1"), name: our, tin: d.ourTin },
            { role: t("view.side2"), name: h.counterparty, tin: h.tin },
          ].map((s) => (
            <div key={s.role} className="flex flex-col gap-0.5 rounded-[6px] border border-border px-3 py-2.5">
              <span className="text-[11.5px] uppercase leading-4 tracking-[0.04em] text-text-secondary">{s.role}</span>
              <span className="font-semibold">{s.name}</span>
              <span className="text-text-secondary">
                {t("view.tin")} <span className="font-mono text-text-primary">{s.tin}</span>
              </span>
            </div>
          ))}
        </div>
        <p>{t("view.openLine", { t: favorText(d.act.opening, h.from) })}</p>
        <div className="overflow-x-auto rounded-[2px] border border-border">
          <div className="min-w-[820px]">
            <div className={cn(grid, "border-b border-border bg-table-header text-caption font-semibold text-text-secondary")}>
              <div className="col-span-5 border-r border-border px-2 py-1.5 text-center">{t("view.ourHead", { n: our })}</div>
              <div className="col-span-2 px-2 py-1.5 text-center">{t("view.theirHead")}</div>
            </div>
            <div className={cn(grid, "border-b border-border bg-table-header text-caption font-medium text-text-secondary")}>
              <div className="px-2 py-1.5">{t("col.date")}</div>
              <div className="px-2 py-1.5">{t("col.doc")}</div>
              <div className="px-2 py-1.5">{t("col.what")}</div>
              <div className="px-2 py-1.5 text-right">{t("col.debit")}</div>
              <div className="border-r border-border px-2 py-1.5 text-right">{t("col.credit")}</div>
              <div className="px-2 py-1.5 text-right">{t("col.debit")}</div>
              <div className="px-2 py-1.5 text-right">{t("col.credit")}</div>
            </div>
            <SheetRow
              grid={grid}
              date={formatIsoDate(h.from)}
              text={t("new.opening")}
              dr={openOnDebit ? dc(absOf(d.act.opening)) : ""}
              cr={!openOnDebit ? dc(absOf(d.act.opening)) : ""}
              weight="font-medium"
            />
            {d.act.lines.map((l) => (
              <SheetRow
                key={`${l.docType}:${l.docId}:${l.occurredAt}:${l.balance}`}
                grid={grid}
                date={formatIsoDate(l.date)}
                doc={l.docNumber}
                text={[isDocType(l.docType) ? t(`view.docType.${l.docType}`) : l.docType, l.note].filter(Boolean).join(" · ")}
                dr={dc(ourDebit(l))}
                cr={dc(ourCredit(l))}
              />
            ))}
            <SheetRow grid={grid} text={t("view.turnover")} dr={formatMoney(dr)} cr={formatMoney(cr)} weight="font-semibold" muted />
            <SheetRow
              grid={grid}
              date={formatIsoDate(h.to)}
              text={t("new.closing")}
              dr={closeOnDebit ? formatMoney(absOf(d.act.closing)) : ""}
              cr={!closeOnDebit && d.act.closing !== "0.00" ? formatMoney(absOf(d.act.closing)) : ""}
              weight="font-semibold"
              muted
            />
          </div>
        </div>
        <p className="text-body font-semibold">{favorText(d.act.closing, h.to)}</p>
        <p className="-mt-3.5 text-caption text-text-secondary">
          {t(h.side === "CUSTOMER" ? "view.formulaCustomer" : "view.formulaSupplier", {
            o: formatMoney(d.act.opening),
            d: formatMoney(dr),
            c: formatMoney(cr),
            z: formatMoney(d.act.closing),
          })}
        </p>
        <div className="grid gap-6 pt-2 md:grid-cols-2">
          {[our, h.counterparty].map((name) => (
            <div key={name} className="flex flex-col gap-3.5">
              <span className="font-semibold">{name}</span>
              {[t("view.signHead"), t("view.signAcc"), t("view.signName")].map((s) => (
                <div key={s} className="grid grid-cols-[110px_minmax(0,1fr)] items-end gap-2">
                  <span className="text-caption text-text-secondary">{s}</span>
                  <span className="h-[18px] border-b border-text-secondary" />
                </div>
              ))}
              <div className="flex size-24 items-center justify-center rounded-full border border-dashed border-border text-caption text-text-secondary">
                {t("view.stamp")}
              </div>
            </div>
          ))}
        </div>
      </article>
    </div>
  );
}

function SheetRow(props: {
  grid: string;
  date?: string;
  doc?: string;
  text: string;
  dr: string;
  cr: string;
  weight?: string;
  muted?: boolean;
}) {
  return (
    <div className={cn(props.grid, "border-b border-border", props.muted ? "bg-table-header" : "bg-surface", props.weight)}>
      <div className="whitespace-nowrap px-2 py-1.5 text-text-secondary">{props.date ?? ""}</div>
      <div className="min-w-0 whitespace-nowrap px-2 py-1.5 font-mono text-caption">{props.doc ?? ""}</div>
      <div className="min-w-0 px-2 py-1.5">{props.text}</div>
      <div className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">{props.dr}</div>
      <div className="whitespace-nowrap border-r border-border px-2 py-1.5 text-right tabular-nums">{props.cr}</div>
      <div className="px-2 py-1.5" />
      <div className="border-l border-dashed border-border px-2 py-1.5" />
    </div>
  );
}
