"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  CalendarCheck,
  Check,
  CircleCheck,
  ClipboardList,
  Download,
  GitBranch,
  Lock,
  Package,
  PackageCheck,
  Percent,
  TrendingDown,
  TriangleAlert,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { MultiFilter } from "@/components/ui/multi-filter";
import { Select } from "@/components/ui/select";
import { ErrorState, ForbiddenState } from "@/components/ui/system-states";
import { Tabs } from "@/components/ui/tabs";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { formatIsoDate, parseMoneyInput, parseUzDate, todayTashkent, usePriceTypes } from "@/features/counterparties/api";
import { useBranchList } from "@/features/organization/api";
import { describeError } from "@/features/setup/form-error";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { cn } from "@/lib/cn";
import { formatMoney, formatQuantity } from "@/lib/format";
import { useBranchStore } from "@/lib/stores/branch";
import { PRICE_CREATE, exportPriceSet, importPriceSet, useSaveDraft, useSubmit } from "./api";
import {
  applyImport,
  applyMarkup,
  EMPTY_SET_FILTER,
  formatPct,
  fromCents,
  importIssues,
  markupBase,
  matchesFilter,
  parsePercent,
  ROUND_STEPS,
  rowState,
  SET_VIEWS,
  toCents,
  toInput,
  VIEW_TEST,
  withoutVat,
  type MarkupRel,
  type RoundStep,
  type SetFilter,
  type SetView,
} from "./price-set";

type GridRow = components["schemas"]["PriceGridRow"];

/** Bir martada chiziladigan qatorlar (5000 ta mahsulotda ham sahifa tez qolsin). */
const CHUNK = 150;

function usePriceGrid(branchId: number | null, priceTypeId: number | null) {
  return useQuery({
    queryKey: ["prices", "grid", branchId, priceTypeId],
    queryFn: () => unwrap(api.GET("/api/prices/grid", { params: { query: { branchId: branchId ?? 0, priceTypeId: priceTypeId ?? 0 } } })),
    enabled: branchId !== null && priceTypeId !== null,
  });
}

const facet = (rows: GridRow[], get: (r: GridRow) => string | null | undefined) => {
  const m = new Map<string, number>();
  for (const r of rows) m.set(get(r) ?? "—", (m.get(get(r) ?? "—") ?? 0) + 1);
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([value, count]) => ({ value, label: value, count }));
};

/**
 * «Narx oʻrnatish» — toʻliq sahifa (prototip `Prices` → set, «Mahsulot boʻyicha»): narx turi, filial, kuchga kirish sanasi,
 * ustama (oʻrtacha / oxirgi kirim yoki bazaviy narxga) va yaxlitlash; qidiruv, chiplar, koʻrinishlar (Hammasi / Narxi yoʻqlar /
 * Oʻzgartirilgan / Tannarxdan past / 20% dan koʻp); jadvalda yangi narx joyida kiritiladi. Saqlash — tasdiq oynasi → NO hujjati
 * (tannarxdan past boʻlsa Direktor tasdigʻiga ketadi).
 */
export function PriceSetPage() {
  const t = useTranslations("prices.set");
  const router = useRouter();
  const params = useSearchParams();
  const me = useMe();
  const types = usePriceTypes();
  const branches = useBranchList();
  const selected = useBranchStore((s) => s.branchId);
  const activeBranches = (branches.data ?? []).filter((b) => b.active);
  const typeOptions = (types.data ?? []).filter((x) => !x.batch);
  const [typeId, setTypeId] = useState<number | null>(() => Number(params.get("type")) || null);
  const [branchPick, setBranchPick] = useState<number | null>(() => Number(params.get("branch")) || null);
  const ownBranch = me.data && !me.data.allBranches ? (me.data.branchId ?? null) : null;
  const branchId = ownBranch ?? branchPick ?? selected ?? activeBranches[0]?.id ?? null;
  const priceTypeId = typeId ?? typeOptions.find((x) => x.base)?.id ?? typeOptions[0]?.id ?? null;
  const grid = usePriceGrid(branchId, priceTypeId);

  const [raw, setRaw] = useState<Record<number, string>>({});
  const [eff, setEff] = useState(() => formatIsoDate(todayTashkent()));
  const [effErr, setEffErr] = useState<string>();
  const [rel, setRel] = useState<MarkupRel>("avg");
  const [pct, setPct] = useState("");
  const [pctErr, setPctErr] = useState<string>();
  const [rnd, setRnd] = useState<RoundStep>(0);
  const [filter, setFilter] = useState<SetFilter>(EMPTY_SET_FILTER);
  const [view, setView] = useState<SetView>("all");
  const [limit, setLimit] = useState(CHUNK);
  const [confirm, setConfirm] = useState(false);
  const [banner, setBanner] = useState<{ tone: "success" | "warning"; text: string } | null>(null);
  const save = useSaveDraft();
  const submit = useSubmit();

  const rows = useMemo(() => grid.data?.items ?? [], [grid.data]);
  const showCost = grid.data?.showCost ?? false;
  const relEff: MarkupRel = showCost ? rel : "base";
  const states = useMemo(() => new Map(rows.map((r) => [r.productId, rowState(r, raw[r.productId], parseMoneyInput)])), [rows, raw]);
  const filtered = useMemo(() => rows.filter((r) => matchesFilter(r, filter)), [rows, filter]);
  const visible = filtered.filter((r) => VIEW_TEST[view](r, states.get(r.productId)!));
  const changed = rows.filter((r) => states.get(r.productId)!.changed);
  const nBelow = changed.filter((r) => states.get(r.productId)!.below).length;
  const nBig = changed.filter((r) => states.get(r.productId)!.big).length;
  const dirty = changed.length > 0;

  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      const res = await importPriceSet(file);
      const applied = applyImport(raw, new Set(rows.map((r) => r.productId)), res.lines);
      setRaw(applied.raw);
      if (applied.n) {
        setView("changed");
        setLimit(CHUNK);
      }
      const outside = applied.outside ? t("importOutside", { k: formatQuantity(applied.outside) }) : "";
      toast({
        tone: applied.n ? "success" : "warning",
        title: (applied.n ? t("imported", { n: formatQuantity(applied.n) }) : t("importedNone")) + outside,
        description: res.issues.length ? t("importSkipped", importIssues(res.issues)) : undefined,
      });
    } catch (err) {
      toast({ tone: "danger", title: describeError(err).message ?? t("importedNone") });
    } finally {
      setImporting(false);
    }
  }
  async function doExport() {
    try {
      const blob = await exportPriceSet(
        visible.map((r) => ({
          code: r.code,
          name: r.name,
          currentPrice: r.currentPrice ?? "",
          newPrice: states.get(r.productId)!.next ?? "",
        })),
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = t("exportFile", { t: typeName });
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast({ tone: "danger", title: t("exportFailed") });
    }
  }

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  if (me.data && !can(me.data, PRICE_CREATE)) return <ForbiddenState />;
  if (grid.error) return <ErrorState onRetry={() => grid.refetch()} />;

  const typeName = grid.data?.priceTypeName ?? typeOptions.find((x) => x.id === priceTypeId)?.name ?? "";
  const branchName = activeBranches.find((b) => b.id === branchId)?.name ?? "";

  function guard(run: () => void) {
    if (!dirty || window.confirm(t("leave"))) run();
  }

  function resetAfterContextChange() {
    setRaw({});
    setView("all");
    setLimit(CHUNK);
  }

  function applyPct() {
    const n = parsePercent(pct);
    if (n == null) return setPctErr(t("errors.pct"));
    setPctErr(undefined);
    const next = { ...raw };
    let k = 0;
    for (const r of visible) {
      const base = markupBase(r, relEff);
      if (base == null) continue;
      next[r.productId] = toInput(fromCents(applyMarkup(base, n, rnd)));
      k++;
    }
    setRaw(next);
    toast({ tone: "success", title: t("applied", { n: formatQuantity(k) }) });
  }

  function trySave() {
    const iso = parseUzDate(eff);
    if (!iso) return setEffErr(t("errors.eff"));
    if (iso < todayTashkent()) return setEffErr(t("errors.past"));
    setEffErr(undefined);
    if (rows.some((r) => states.get(r.productId)!.bad)) return toast({ tone: "danger", title: t("errors.price") });
    if (!changed.length) return toast({ tone: "warning", title: t("errors.none") });
    setConfirm(true);
  }

  function doSave() {
    const iso = parseUzDate(eff);
    if (!iso || branchId === null || priceTypeId === null) return;
    const lines = changed.map((r) => ({ productId: r.productId, priceTypeId, newPrice: states.get(r.productId)!.next! }));
    save.mutate(
      { body: { branchId, effectiveFrom: iso, lines } },
      {
        onSuccess: (d) =>
          submit.mutate(d.id, {
            onSuccess: (x) => {
              setConfirm(false);
              setRaw({});
              setView("all");
              setBanner(
                x.status === "PENDING_APPROVAL"
                  ? { tone: "warning", text: t("savedPending", { no: x.number }) }
                  : {
                      tone: "success",
                      text: t("savedPosted", { no: x.number, n: formatQuantity(x.lines.length), d: formatIsoDate(x.effectiveFrom) }),
                    },
              );
              void grid.refetch();
            },
          }),
      },
    );
  }

  const err = describeError(save.error ?? submit.error).message;
  const withChg = changed.map((r) => states.get(r.productId)!.chg).filter((x): x is number => x != null);
  const avgChg = withChg.length ? withChg.reduce((a, b) => a + b, 0) / withChg.length : null;
  const summary: { icon: LucideIcon; text: string; tone?: "danger" }[] = [
    { icon: CalendarCheck, text: t("d.eff", { n: formatQuantity(changed.length), d: eff }) },
    { icon: Percent, text: t("d.avg", { x: formatPct(avgChg) }) },
    { icon: GitBranch, text: t("d.branch", { b: branchName }) },
    { icon: ClipboardList, text: t("d.drafts") },
    { icon: Lock, text: t("d.conf") },
    ...(nBelow ? [{ icon: TrendingDown, text: t("d.below", { n: formatQuantity(nBelow) }), tone: "danger" as const }] : []),
  ];
  const bigRows = changed.filter((r) => states.get(r.productId)!.big);

  return (
    <div className="flex min-w-0 flex-col gap-4 " data-screen-label="Narx oʻrnatish">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <nav className="flex items-center gap-1.5 text-caption">
            <button type="button" onClick={() => guard(() => router.push("/prices"))} className="text-primary-button hover:underline">
              {t("crumb")}
            </button>
            <span className="text-text-secondary">/</span>
            <span className="text-text-secondary">{t("title")}</span>
          </nav>
          <h1 className="text-[22px] leading-7 font-semibold tracking-[-0.01em]">{t("heading", { t: typeName, b: branchName })}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={onImportFile} />
          <Button variant="secondary" icon={Upload} disabled={importing || !rows.length} onClick={() => fileRef.current?.click()}>
            {importing ? t("importing") : t("importXls")}
          </Button>
          <Button variant="secondary" icon={Download} disabled={!visible.length} onClick={doExport}>
            {t("export")}
          </Button>
          <Button variant="secondary" onClick={() => guard(() => router.push("/prices"))}>
            {t("close")}
          </Button>
          <Button icon={Check} onClick={trySave}>
            {t("save")}
          </Button>
        </div>
      </div>
      {banner ? <Alert tone={banner.tone} icon={banner.tone === "success" ? CircleCheck : TriangleAlert} title={banner.text} /> : null}
      <div role="tablist" aria-label={t("modeLabel")} className="inline-flex w-fit gap-1 rounded-lg bg-background p-1">
        {(
          [
            ["prod", t("modeProd"), Package],
            ["rc", t("modeRc"), PackageCheck],
          ] as const
        ).map(([k, label, Icon]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={k === "prod"}
            onClick={() => (k === "rc" ? guard(() => router.push("/prices?new=receipt")) : undefined)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium",
              k === "prod" ? "bg-surface text-primary shadow-sm" : "text-text-secondary hover:text-text-primary",
            )}
          >
            <Icon className="size-[15px]" strokeWidth={1.5} aria-hidden />
            {label}
          </button>
        ))}
      </div>
      <section className="grid grid-cols-1 gap-3 rounded-card border border-border bg-surface p-4 sm:grid-cols-2 xl:grid-cols-6">
        <Select
          label={t("type")}
          value={priceTypeId ? String(priceTypeId) : null}
          onChange={(v) => guard(() => (setTypeId(v ? Number(v) : null), resetAfterContextChange()))}
          options={typeOptions.map((x) => ({ value: String(x.id), label: x.name }))}
        />
        <Select
          label={t("branch")}
          value={branchId ? String(branchId) : null}
          disabled={ownBranch !== null}
          onChange={(v) => guard(() => (setBranchPick(v ? Number(v) : null), resetAfterContextChange()))}
          options={activeBranches.map((b) => ({ value: String(b.id), label: b.name, sub: b.code }))}
        />
        <TextField
          label={t("eff")}
          value={eff}
          onChange={(v) => (setEff(v), setEffErr(undefined))}
          placeholder="kk.oo.yyyy"
          inputMode="numeric"
          error={effErr}
        />
        <Select
          label={t("rel")}
          value={relEff}
          onChange={(v) => v && setRel(v as MarkupRel)}
          options={(showCost ? (["avg", "last", "base"] as const) : (["base"] as const)).map((k) => ({
            value: k,
            label: t(`relOpt.${k}`),
          }))}
        />
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <TextField
              label={t("pct")}
              value={pct}
              onChange={(v) => (setPct(v), setPctErr(undefined))}
              placeholder={t("pctPh")}
              inputMode="decimal"
              error={pctErr}
            />
          </div>
          <Button variant="secondary" onClick={applyPct} className={pctErr ? "mb-6" : undefined}>
            {t("apply")}
          </Button>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-caption font-medium">{t("rnd")}</span>
          <div className="inline-flex h-control-md gap-1 rounded-lg bg-background p-1">
            {ROUND_STEPS.map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={rnd === n}
                onClick={() => setRnd(n)}
                className={cn(
                  "flex-1 rounded-md px-2 text-[13px] font-medium",
                  rnd === n ? "bg-surface text-primary shadow-sm" : "text-text-secondary hover:text-text-primary",
                )}
              >
                {n ? formatQuantity(n) : t("rndOff")}
              </button>
            ))}
          </div>
        </div>
      </section>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-[380px] max-w-full">
            <TextField
              label={t("search")}
              variant="search"
              size="sm"
              value={filter.q}
              onChange={(v) => (setFilter((f) => ({ ...f, q: v })), setLimit(CHUNK))}
              placeholder={t("searchPh")}
              className="[&>label]:sr-only"
            />
          </div>
          {(
            [
              ["makers", t("f.maker"), (r: GridRow) => r.manufacturer],
              ["categories", t("f.category"), (r: GridRow) => r.category],
              ["countries", t("f.country"), (r: GridRow) => r.country],
              ["supply", t("f.supply"), (r: GridRow) => r.supplyEmployee],
            ] as const
          ).map(([k, label, get]) => (
            <MultiFilter
              key={k}
              label={label}
              searchable
              options={facet(rows, get)}
              selected={filter[k]}
              onChange={(v) => (setFilter((f) => ({ ...f, [k]: v })), setLimit(CHUNK))}
            />
          ))}
          {filter.q || filter.makers.length || filter.categories.length || filter.countries.length || filter.supply.length ? (
            <button
              type="button"
              onClick={() => (setFilter(EMPTY_SET_FILTER), setView("all"))}
              className="h-control-sm px-1.5 text-[13px] font-medium text-primary-button hover:underline"
            >
              {t("clear")}
            </button>
          ) : null}
        </div>
        <Tabs
          aria-label={t("viewsLabel")}
          value={view}
          onChange={(k) => (setView(k as SetView), setLimit(CHUNK))}
          items={SET_VIEWS.map((k) => ({
            key: k,
            label: t(`views.${k}`),
            count: filtered.filter((r) => VIEW_TEST[k](r, states.get(r.productId)!)).length,
          }))}
        />
      </div>
      <div className="min-w-0 overflow-x-auto rounded-card border border-border bg-surface">
        <table className="w-full min-w-[1180px] border-collapse text-[13px]">
          <caption className="sr-only">{t("caption")}</caption>
          <thead>
            <tr className="border-b border-border bg-table-header text-left text-caption font-medium text-text-secondary">
              <th className="w-11 px-3 py-2">№</th>
              <th className="w-[92px] px-3 py-2">{t("k.code")}</th>
              <th className="px-3 py-2">{t("k.prod")}</th>
              <th className="w-[130px] px-3 py-2">{t("k.cat")}</th>
              {showCost ? (
                <>
                  <th className="w-32 px-3 py-2 text-right">{t("k.avg")}</th>
                  <th className="w-28 px-3 py-2 text-right">{t("k.last")}</th>
                </>
              ) : null}
              <th className="w-[150px] px-3 py-2 text-right">{t("k.cur")}</th>
              <th className="w-[150px] px-3 py-2 text-right">{t("k.new")}</th>
              <th className="w-[88px] px-3 py-2 text-right">{t("k.chg")}</th>
              {showCost ? <th className="w-20 px-3 py-2 text-right">{t("k.mk")}</th> : null}
              <th className="w-16 px-3 py-2">
                <span className="sr-only">{t("k.flags")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {grid.isPending ? (
              <tr>
                <td colSpan={12} className="px-3 py-10 text-center text-text-secondary">
                  {t("loading")}
                </td>
              </tr>
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-3 py-10 text-center text-text-secondary">
                  {t("empty")}
                </td>
              </tr>
            ) : (
              visible.slice(0, limit).map((r, i) => {
                const s = states.get(r.productId)!;
                const v = raw[r.productId] ?? "";
                const nv = s.next ? toCents(s.next) : null;
                return (
                  <tr key={r.productId} className={cn("border-b border-border last:border-b-0", s.below && "bg-danger-bg/40")}>
                    <td className="px-3 py-2 text-text-secondary">{i + 1}</td>
                    <td className="px-3 py-2 font-mono text-mono">{r.code}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.name}</div>
                      <div className="text-caption text-text-secondary">{[r.manufacturer, r.country].filter(Boolean).join(" · ")}</div>
                    </td>
                    <td className="px-3 py-2 text-text-secondary">{r.category ?? "—"}</td>
                    {showCost ? (
                      <>
                        <td className="px-3 py-2 text-right tabular-nums text-text-secondary">
                          {r.avgCost ? formatMoney(r.avgCost) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-text-secondary">
                          {r.lastCost ? formatMoney(r.lastCost) : "—"}
                        </td>
                      </>
                    ) : null}
                    <td className="px-3 py-2 text-right tabular-nums">
                      <div className={r.currentPrice ? "" : "text-warning"}>{r.currentPrice ? formatMoney(r.currentPrice) : "—"}</div>
                      {r.nextPrice && r.nextFrom ? (
                        <div className="text-caption text-info">
                          {t("nextChip", { p: formatMoney(r.nextPrice), d: formatIsoDate(r.nextFrom) })}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <input
                        value={v}
                        onChange={(e) => setRaw((o) => ({ ...o, [r.productId]: e.target.value }))}
                        inputMode="decimal"
                        aria-label={`${t("k.new")} — ${r.name}`}
                        aria-invalid={s.bad || undefined}
                        className={cn(
                          "h-8 w-full rounded-md border px-2 text-right tabular-nums outline-none focus:border-primary focus:ring-3 focus:ring-primary/15",
                          s.bad || s.below
                            ? "border-danger"
                            : s.big
                              ? "border-warning"
                              : s.changed
                                ? "border-primary bg-primary-soft"
                                : "border-border bg-surface",
                        )}
                      />
                      {nv != null ? (
                        <div className="mt-0.5 text-caption text-text-secondary">
                          {t("noVat", { v: formatMoney(fromCents(withoutVat(nv, r.vatRate))) })}
                        </div>
                      ) : null}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2 text-right tabular-nums",
                        s.chg == null ? "text-text-secondary" : s.chg > 0 ? "text-success" : "text-danger",
                      )}
                    >
                      {formatPct(s.chg)}
                    </td>
                    {showCost ? (
                      <td
                        className={cn(
                          "px-3 py-2 text-right tabular-nums",
                          s.markup != null && s.markup < 0 ? "text-danger" : "text-text-secondary",
                        )}
                      >
                        {formatPct(s.markup)}
                      </td>
                    ) : null}
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-1.5">
                        {s.below ? (
                          <span title={r.costLimit ? t("flBelow", { c: formatMoney(r.costLimit) }) : t("flBelow0")} className="text-danger">
                            <TrendingDown className="size-4" strokeWidth={1.5} aria-label={t("views.below")} />
                          </span>
                        ) : null}
                        {s.big ? (
                          <span title={t("flBig", { x: formatPct(s.chg) })} className="text-warning">
                            <TriangleAlert className="size-4" strokeWidth={1.5} aria-label={t("views.big")} />
                          </span>
                        ) : null}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        {visible.length > limit ? (
          <div className="flex justify-center border-t border-border p-3">
            <Button variant="tertiary" size="sm" onClick={() => setLimit((n) => n + CHUNK * 2)}>
              {t("more", { n: formatQuantity(visible.length - limit) })}
            </Button>
          </div>
        ) : null}
      </div>
      <div className="sticky bottom-0 z-10 -mx-6 -mb-6 flex items-center justify-end gap-4 border-t border-border bg-surface px-6 py-3">
        <span className="text-[13px] text-text-secondary">
          {t("foot", { n: formatQuantity(changed.length), m: formatQuantity(nBelow), k: formatQuantity(nBig) })}
        </span>
        <Button icon={Check} onClick={trySave}>
          {t("save")}
        </Button>
      </div>
      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title={t("dlgTitle")}
        primaryAction={{ label: t("save"), onClick: doSave, loading: save.isPending || submit.isPending }}
        secondaryAction={{ label: t("cancel"), onClick: () => setConfirm(false) }}
      >
        <div className="flex flex-col gap-3">
          {summary.map((x) => (
            <div key={x.text} className="flex items-start gap-2.5 text-[13px]">
              <x.icon
                className={cn("mt-0.5 size-4 shrink-0", x.tone === "danger" ? "text-danger" : "text-text-secondary")}
                strokeWidth={1.5}
                aria-hidden
              />
              <span className={x.tone === "danger" ? "text-danger" : undefined}>{x.text}</span>
            </div>
          ))}
          {bigRows.length ? (
            <div className="flex flex-col gap-1.5 rounded-lg border border-warning/40 bg-warning-bg p-3 text-[13px]">
              <span className="font-medium">{t("d.big")}</span>
              {bigRows.map((r) => (
                <div key={r.productId} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate">{r.name}</span>
                  <span className="shrink-0 tabular-nums text-text-secondary">
                    {r.currentPrice ? formatMoney(r.currentPrice) : "—"} → {formatMoney(states.get(r.productId)!.next!)}
                  </span>
                  <span className="w-16 shrink-0 text-right tabular-nums">{formatPct(states.get(r.productId)!.chg)}</span>
                </div>
              ))}
            </div>
          ) : null}
          {err ? <Alert tone="danger" title={err} /> : null}
        </div>
      </Modal>
    </div>
  );
}
