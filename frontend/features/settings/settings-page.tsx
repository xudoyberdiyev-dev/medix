"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  CalendarClock,
  CircleCheck,
  Eye,
  FileText,
  History,
  Lock,
  Percent,
  Plus,
  Printer,
  Shield,
  ShoppingCart,
  Wallet,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Consequences, Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { ErrorState, ForbiddenState, Skeleton } from "@/components/ui/system-states";
import { toast } from "@/components/ui/toast";
import { can } from "@/features/auth/can";
import { ensureCsrf, useMe } from "@/features/auth/session";
import { formatIsoDate, parseUzDate } from "@/features/counterparties/api";
import { describeError } from "@/features/setup/form-error";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { displaySetting, settingChanges, settingError, vatRateValid, type SettingKind } from "./settings-form";

type View = components["schemas"]["SettingsView"];
type SettingValue = components["schemas"]["SettingValue"];
type SettingKeyName = SettingValue["key"];
type SectionKey = "WH" | "SALES" | "MONEY" | "VAT" | "PRINT" | "DOCS" | "BQ" | "SEC";

const SECTIONS: { key: SectionKey; icon: LucideIcon; scope: "dir" | "sec" | "none" }[] = [
  { key: "WH", icon: Warehouse, scope: "dir" },
  { key: "SALES", icon: ShoppingCart, scope: "dir" },
  { key: "MONEY", icon: Wallet, scope: "dir" },
  { key: "VAT", icon: Percent, scope: "dir" },
  { key: "PRINT", icon: Printer, scope: "dir" },
  { key: "DOCS", icon: FileText, scope: "none" },
  { key: "BQ", icon: Archive, scope: "none" },
  { key: "SEC", icon: Shield, scope: "sec" },
];

const VAT_TONE: Record<components["schemas"]["VatRow"]["status"], [Tone, LucideIcon]> = {
  ACTIVE: ["success", CircleCheck],
  FUTURE: ["info", CalendarClock],
  PAST: ["neutral", History],
};

const KEY = ["settings"];

/** Prototip Settings: chap boʻlimlar, qiymatlar «Oxirgi oʻzgarish» bilan, qoralama → tasdiq oynasi → saqlash (audit). */
export function SettingsPage() {
  const t = useTranslations("settings");
  const me = useMe();
  const qc = useQueryClient();
  const allowed = can(me.data, "settings.view");
  const q = useQuery({ queryKey: KEY, queryFn: () => unwrap(api.GET("/api/settings")), enabled: allowed });
  const [sec, setSec] = useState<SectionKey>("WH");
  const [draft, setDraft] = useState<Partial<Record<SettingKeyName, string>>>({});
  const [confirm, setConfirm] = useState(false);
  const [roMsg, setRoMsg] = useState<string | null>(null);
  const roTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(roTimer.current), []);

  const onSaved = (d: View, msg: string) => {
    qc.setQueryData(KEY, d);
    toast({ tone: "success", title: msg });
  };
  const onFail = (e: unknown) => toast({ tone: "danger", title: t("saveFailed"), description: describeError(e).message ?? undefined });

  const save = useMutation({
    mutationFn: async (values: Record<string, string>) => {
      await ensureCsrf();
      return unwrap(api.PUT("/api/settings", { body: { values } }));
    },
    onSuccess: (d, values) => {
      setDraft({});
      setConfirm(false);
      onSaved(d, t("saved", { n: Object.keys(values).length }));
    },
    onError: onFail,
  });

  if (me.data && !allowed) return <ForbiddenState description={t("forbidden")} />;
  const d = q.data;
  const values = d?.values ?? [];
  const canSec = (scope: "dir" | "sec" | "none") => (scope === "dir" ? !!d?.canEdit : scope === "sec" ? !!d?.canSecurity : false);
  const cur = SECTIONS.find((s) => s.key === sec) ?? SECTIONS[0]!;
  const editable = canSec(cur.scope);
  const changes = settingChanges(
    values.map((v) => ({ key: v.key, kind: v.kind as SettingKind, min: v.min, max: v.max, value: v.value })),
    draft,
  );
  const draftKeys = Object.keys(draft) as SettingKeyName[];
  const hasErr = draftKeys.some((k) => {
    const v = values.find((x) => x.key === k);
    const raw = draft[k];
    return !!v && raw !== undefined && !!settingError(v.kind as SettingKind, v.min, v.max, raw);
  });
  const dirtyBy = (s: SectionKey) => draftKeys.some((k) => values.find((v) => v.key === k)?.section === s);
  const unit = (kind: string) => t(`unit.${kind}` as "unit.DAY");
  const meta = (v: { updatedAt?: string | null; updatedBy?: string | null }) =>
    v.updatedAt ? t("lastChange", { t: formatDate(new Date(v.updatedAt)), n: v.updatedBy ?? t("system") }) : t("defaultVal");
  const showRo = (k: string) => {
    clearTimeout(roTimer.current);
    setRoMsg(k);
    roTimer.current = setTimeout(() => setRoMsg(null), 2600);
  };
  const setVal = (v: SettingValue, raw: string) =>
    setDraft((p) => {
      const n = { ...p, [v.key]: raw };
      if (
        !settingError(v.kind as SettingKind, v.min, v.max, raw) &&
        settingChanges([{ ...v, kind: v.kind as SettingKind }], { [v.key]: raw }).length === 0
      )
        delete n[v.key];
      return n;
    });
  const errText = (v: SettingValue, raw: string) => {
    const e = settingError(v.kind as SettingKind, v.min, v.max, raw);
    if (!e) return null;
    return e.code === "num" ? t("eNum") : e.code === "sum" ? t("eSum") : t("eRange", { a: e.min, b: e.max });
  };

  const rows = values.filter((v) => v.section === sec);

  return (
    <>
      <div className="mb-5">
        <h1 className="text-page-title">{t("title")}</h1>
        <p className="text-body text-text-secondary">{t("subtitle")}</p>
      </div>
      {q.error ? (
        <ErrorState onRetry={() => q.refetch()} />
      ) : (
        <div className={cn("grid items-start gap-4 pb-20", "grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)]")}>
          <nav
            aria-label={t("title")}
            className="flex gap-1 overflow-x-auto rounded-card border border-border bg-surface p-2 lg:sticky lg:top-0 lg:flex-col lg:gap-0.5"
          >
            {SECTIONS.map(({ key, icon: Icon }) => {
              const on = key === sec;
              return (
                <button
                  key={key}
                  type="button"
                  aria-current={on ? "page" : undefined}
                  onClick={() => setSec(key)}
                  className={cn(
                    "flex h-[38px] flex-none items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px]",
                    on ? "bg-primary-soft font-semibold text-text-primary" : "font-medium text-text-primary hover:bg-background",
                  )}
                >
                  <Icon size={16} strokeWidth={1.5} aria-hidden className={on ? "text-primary" : "text-text-secondary"} />
                  <span className="flex-1 whitespace-nowrap">{t(`sec.${key}`)}</span>
                  {dirtyBy(key) ? <span aria-hidden className="size-1.5 rounded-full bg-warning" /> : null}
                </button>
              );
            })}
          </nav>
          <section className="min-w-0 overflow-hidden rounded-card border border-border bg-surface">
            <header className="flex flex-col gap-0.5 border-b border-border px-6 py-4">
              <h2 className="text-[17px] leading-6 font-semibold">{t(`sec.${sec}`)}</h2>
              {d && cur.scope !== "none" && !editable ? (
                <span className="flex items-center gap-1.5 text-[13px] leading-[18px] text-text-secondary">
                  <Eye size={14} strokeWidth={1.5} aria-hidden />
                  {cur.scope === "sec" ? t("roSec") : t("roDir")}
                </span>
              ) : null}
            </header>
            {!d ? (
              <div className="p-6">
                <Skeleton className="h-40 w-full" />
              </div>
            ) : (
              <>
                {rows.map((v) => {
                  const has = draft[v.key] !== undefined;
                  const raw = draft[v.key] ?? displaySetting(v.kind as SettingKind, v.value);
                  const err = has ? errText(v, raw) : null;
                  const changed = has && !err;
                  return (
                    <SettingRow
                      key={v.key}
                      name={t(`cfg.${v.key}.name` as "cfg.pwMin.name")}
                      desc={t(`cfg.${v.key}.desc` as "cfg.pwMin.desc")}
                      meta={meta(v)}
                      value={raw}
                      unit={unit(v.kind)}
                      wide={v.kind === "SUM"}
                      readOnly={!editable}
                      changed={changed}
                      error={err}
                      roMsg={roMsg === v.key ? (cur.scope === "sec" ? t("roSec") : t("roDir")) : null}
                      onRoClick={() => showRo(v.key)}
                      onChange={(x) => setVal(v, x)}
                    />
                  );
                })}
                {sec === "VAT" ? <VatSection view={d} onSaved={onSaved} onFail={onFail} /> : null}
                {sec === "PRINT" ? <PrintSection view={d} onSaved={onSaved} onFail={onFail} onRo={() => showRo("print")} /> : null}
                {sec === "DOCS" ? <DocsSection view={d} /> : null}
                {sec === "BQ" ? (
                  <SettingRow
                    name={t("cfg.bqCut.name")}
                    desc={d.opening.locked ? t("bqLocked") : d.opening.cutoffDate ? t("cfg.bqCut.desc") : t("bqNone")}
                    meta={t("defaultVal")}
                    value={formatIsoDate(d.opening.cutoffDate) || "—"}
                    unit={unit("DATE")}
                    wide
                    readOnly
                    changed={false}
                    error={null}
                    roMsg={roMsg === "bq" && d.opening.locked ? t("bqLockedShort") : null}
                    onRoClick={() => showRo("bq")}
                    onChange={() => undefined}
                  />
                ) : null}
              </>
            )}
          </section>
        </div>
      )}
      {draftKeys.length > 0 ? (
        <div className="sticky bottom-0 z-10 -mx-6 -mb-6 flex h-16 items-center justify-end gap-3 border-t border-border bg-surface px-6">
          <span className="mr-auto flex items-center gap-2 text-[13px] text-warning">
            <span aria-hidden className="size-1.5 rounded-full bg-warning" />
            {t("nChanges", { n: draftKeys.length })}
          </span>
          <Button variant="secondary" onClick={() => setDraft({})}>
            {t("cancel")}
          </Button>
          <Button
            onClick={() => {
              if (hasErr) return;
              if (changes.length === 0) return setDraft({});
              setConfirm(true);
            }}
          >
            {t("save")}
          </Button>
        </div>
      ) : null}
      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title={t("saveTitle", { n: changes.length })}
        primaryAction={{
          label: t("save"),
          loading: save.isPending,
          onClick: () => save.mutate(Object.fromEntries(changes.map((c) => [c.key, c.to]))),
        }}
        secondaryAction={{ label: t("cancel"), onClick: () => setConfirm(false) }}
      >
        <p className="text-body text-text-secondary">{t("saveText", { n: d?.pendingOrders ?? 0 })}</p>
        <Consequences
          items={changes.map((c) => {
            const v = values.find((x) => x.key === c.key)!;
            const u = unit(v.kind);
            return t("line", {
              l: t(`cfg.${c.key}.name` as "cfg.pwMin.name"),
              a: `${displaySetting(v.kind as SettingKind, c.from)} ${u}`,
              b: `${displaySetting(v.kind as SettingKind, c.to)} ${u}`,
            });
          })}
        />
      </Modal>
    </>
  );
}

function SettingRow({
  name,
  desc,
  meta,
  value,
  unit,
  wide,
  readOnly,
  changed,
  error,
  roMsg,
  onRoClick,
  onChange,
}: {
  name: string;
  desc: string;
  meta: string;
  value: string;
  unit: string;
  wide: boolean;
  readOnly: boolean;
  changed: boolean;
  error: string | null;
  roMsg: string | null;
  onRoClick: () => void;
  onChange: (v: string) => void;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-6 border-b border-border px-6 py-4 transition-colors duration-150",
        changed ? "bg-primary-soft" : "bg-surface",
      )}
    >
      <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-0.5">
        <span className="text-body font-medium">{name}</span>
        <span className="text-[13px] leading-[18px] text-pretty text-text-secondary">{desc}</span>
        <span className="mt-1 text-[12px] leading-4 text-text-secondary">{meta}</span>
      </div>
      <div className="flex flex-none flex-col items-end gap-1">
        <div
          onClick={readOnly ? onRoClick : undefined}
          className={cn(
            "flex h-[34px] items-center overflow-hidden rounded-lg border",
            wide ? "w-[220px]" : "w-[150px]",
            error ? "border-danger" : changed ? "border-primary" : "border-border",
            readOnly ? "bg-background" : "bg-surface",
          )}
        >
          {readOnly ? <Lock size={14} strokeWidth={1.5} aria-hidden className="ml-2.5 text-text-secondary" /> : null}
          <input
            value={value}
            readOnly={readOnly}
            inputMode="numeric"
            aria-label={name}
            aria-invalid={error ? true : undefined}
            onChange={(e) => onChange(e.target.value)}
            className={cn(
              "h-full min-w-0 flex-1 border-0 bg-transparent px-2.5 text-right text-body tabular-nums outline-none",
              readOnly ? "cursor-not-allowed text-text-secondary" : "text-text-primary",
            )}
          />
          <span className="flex h-full flex-none items-center border-l border-border bg-background px-2.5 text-[13px] text-text-secondary">
            {unit}
          </span>
        </div>
        {error ? <span className="text-[12px] leading-4 text-danger">{error}</span> : null}
        {roMsg ? <span className="text-[12px] leading-4 text-warning">{roMsg}</span> : null}
      </div>
    </div>
  );
}

function VatSection({ view, onSaved, onFail }: { view: View; onSaved: (d: View, msg: string) => void; onFail: (e: unknown) => void }) {
  const t = useTranslations("settings");
  const [rate, setRate] = useState("");
  const [from, setFrom] = useState("");
  const [tried, setTried] = useState(false);
  const add = useMutation({
    mutationFn: async (body: { rate: string; validFrom: string }) => {
      await ensureCsrf();
      return unwrap(api.POST("/api/settings/vat", { body }));
    },
    onSuccess: (d, b) => {
      setRate("");
      setFrom("");
      setTried(false);
      onSaved(d, t("vatAdded", { r: b.rate.replace(".", ","), d: formatIsoDate(b.validFrom) }));
    },
    onError: onFail,
  });
  const iso = parseUzDate(from);
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tashkent" });
  const err = !tried
    ? null
    : !vatRateValid(rate)
      ? t("eRange", { a: 0, b: 100 })
      : !iso
        ? t("eDate")
        : iso <= today
          ? t("eFuture")
          : view.vatHistory.some((v) => v.validFrom === iso)
            ? t("eDupDate")
            : null;
  return (
    <div className="flex flex-col gap-3 border-b border-border px-6 py-4">
      <span className="text-[13px] leading-[18px] font-semibold">{t("vatHist")}</span>
      <div className="overflow-hidden rounded-lg border border-border">
        <div className="grid grid-cols-[100px_150px_minmax(0,1fr)_110px] gap-3 border-b border-border bg-table-header px-3 py-2 text-[12px] font-medium text-text-secondary">
          <span>{t("vatRate")}</span>
          <span>{t("vatFrom")}</span>
          <span>{t("vatWho")}</span>
          <span>{t("status")}</span>
        </div>
        {view.vatHistory.map((v) => (
          <div
            key={v.id}
            className="grid grid-cols-[100px_150px_minmax(0,1fr)_110px] items-center gap-3 border-b border-border px-3 py-2 text-[13px] last:border-b-0"
          >
            <span className="font-medium">{v.rate.replace(".", ",")}%</span>
            <span className="font-mono text-[12.5px]">{formatIsoDate(v.validFrom)}</span>
            <span className="text-text-secondary">{v.createdBy ?? t("system")}</span>
            <span>
              <Badge tone={VAT_TONE[v.status][0]} icon={VAT_TONE[v.status][1]}>
                {t(`vatSt.${v.status}`)}
              </Badge>
            </span>
          </div>
        ))}
      </div>
      {view.canEdit ? (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-medium">{t("vatNewRate")}</span>
              <span className="flex h-[34px] w-[120px] items-center overflow-hidden rounded-lg border border-border">
                <input
                  value={rate}
                  inputMode="decimal"
                  onChange={(e) => setRate(e.target.value)}
                  className="h-full min-w-0 flex-1 border-0 bg-transparent px-2.5 text-right text-body outline-none"
                />
                <span className="px-2.5 text-[13px] text-text-secondary">%</span>
              </span>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-medium">{t("vatFrom")}</span>
              <input
                value={from}
                placeholder="01.01.2027"
                onChange={(e) => setFrom(e.target.value)}
                className={cn(
                  "h-[34px] w-[140px] rounded-lg border px-2.5 font-mono text-[13px] outline-none",
                  err ? "border-danger" : "border-border",
                )}
              />
            </label>
            <Button
              variant="secondary"
              icon={Plus}
              loading={add.isPending}
              onClick={() => {
                setTried(true);
                const okIso = parseUzDate(from);
                if (!vatRateValid(rate) || !okIso || okIso <= today || view.vatHistory.some((v) => v.validFrom === okIso)) return;
                add.mutate({ rate: rate.trim().replace(",", "."), validFrom: okIso });
              }}
            >
              {t("vatAdd")}
            </Button>
          </div>
          {err ? <span className="text-[12px] leading-4 text-danger">{err}</span> : null}
          <span className="text-[12px] leading-4 text-text-secondary">{t("vatHint")}</span>
        </>
      ) : null}
    </div>
  );
}

function Segmented<T extends string>({
  label,
  options,
  value,
  onPick,
}: {
  label: string;
  options: [T, string][];
  value: T;
  onPick: (v: T) => void;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex h-[34px] gap-0.5 rounded-lg border border-border bg-background p-0.5">
      {options.map(([k, l]) => (
        <button
          key={k}
          type="button"
          role="tab"
          aria-selected={k === value}
          onClick={() => onPick(k)}
          className={cn(
            "h-7 rounded-md px-3 text-[13px] font-medium",
            k === value ? "bg-surface text-text-primary shadow-sm" : "text-text-secondary hover:text-text-primary",
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

function PrintSection({
  view,
  onSaved,
  onFail,
  onRo,
}: {
  view: View;
  onSaved: (d: View, msg: string) => void;
  onFail: (e: unknown) => void;
  onRo: () => void;
}) {
  const t = useTranslations("settings");
  const can = view.canEdit;
  const cfg = useMutation({
    mutationFn: async (body: components["schemas"]["PrintUpdate"]) => {
      await ensureCsrf();
      return unwrap(api.PUT("/api/settings/print", { body }));
    },
    onSuccess: (d) => onSaved(d, t("prSaved")),
    onError: onFail,
  });
  const signer = useMutation({
    mutationFn: async ({ branchId, ...body }: { branchId: number; headId?: number; accountantId?: number }) => {
      await ensureCsrf();
      return unwrap(api.PUT("/api/settings/print/signers/{branchId}", { params: { path: { branchId } }, body }));
    },
    onSuccess: (d) => onSaved(d, t("prSaved")),
    onError: onFail,
  });
  const p = view.print;
  const opts = (list: { id: number; name: string }[]) => [
    { value: "", label: t("auto") },
    ...list.map((e) => ({ value: String(e.id), label: e.name })),
  ];
  return (
    <div className="flex flex-col gap-3 border-b border-border px-6 py-4">
      <span className="text-[13px] leading-[18px] text-text-secondary">{t("prSub")}</span>
      <span className="text-[13px] leading-[18px] font-semibold">{t("prSigners")}</span>
      <div className="overflow-hidden rounded-lg border border-border">
        <div className="grid grid-cols-[140px_minmax(0,1fr)_minmax(0,1fr)] gap-3 border-b border-border bg-table-header px-3 py-2 text-[12px] font-medium text-text-secondary">
          <span>{t("branch")}</span>
          <span>{t("head")}</span>
          <span>{t("acc")}</span>
        </div>
        {p.signers.map((b) => (
          <div
            key={b.branchId}
            className="grid grid-cols-[140px_minmax(0,1fr)_minmax(0,1fr)] items-start gap-3 border-b border-border px-3 py-2 text-[13px] last:border-b-0"
          >
            <span className="leading-[34px] font-medium">{b.branchName}</span>
            <div className="flex flex-col gap-0.5">
              <Select
                label={`${b.branchName} · ${t("head")}`}
                size="sm"
                options={opts(b.headOptions)}
                value={b.headId == null ? "" : String(b.headId)}
                disabled={!can}
                onChange={(v) =>
                  signer.mutate({ branchId: b.branchId, headId: v ? Number(v) : undefined, accountantId: b.accountantId ?? undefined })
                }
              />
              <span className="text-[12px] text-text-secondary">{b.autoHead ? t("autoBy", { n: b.autoHead }) : t("autoNone")}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <Select
                label={`${b.branchName} · ${t("acc")}`}
                size="sm"
                options={opts(b.accountantOptions)}
                value={b.accountantId == null ? "" : String(b.accountantId)}
                disabled={!can}
                onChange={(v) =>
                  signer.mutate({ branchId: b.branchId, headId: b.headId ?? undefined, accountantId: v ? Number(v) : undefined })
                }
              />
              <span className="text-[12px] text-text-secondary">
                {b.autoAccountant ? t("autoBy", { n: b.autoAccountant }) : t("autoNone")}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
        <div className="flex flex-[1_1_280px] flex-col gap-0.5">
          <span className="text-body font-medium">{t("reprint")}</span>
          <span className="text-[13px] text-text-secondary">{t("reprintD")}</span>
        </div>
        <Segmented
          label={t("reprint")}
          options={[
            ["yes", t("yes")],
            ["no", t("no")],
          ]}
          value={p.reprintMark ? "yes" : "no"}
          onPick={(k) => (can ? cfg.mutate({ reprintMark: k === "yes" }) : onRo())}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <span className="text-body font-medium">{t("nakDef")}</span>
        <Segmented
          label={t("nakDef")}
          options={[
            ["PRICE", t("vPrice")],
            ["NOPRICE", t("vNoPrice")],
          ]}
          value={p.invoiceVariant}
          onPick={(k) => (can ? cfg.mutate({ invoiceVariant: k }) : onRo())}
        />
      </div>
    </div>
  );
}

function DocsSection({ view }: { view: View }) {
  const t = useTranslations("settings");
  return (
    <div className="flex flex-col gap-3 px-6 py-4">
      <span className="text-[13px] leading-[18px] text-text-secondary">{t("docFmt")}</span>
      <div className="overflow-hidden rounded-lg border border-border">
        <div className="grid grid-cols-[90px_minmax(0,1fr)_180px_90px] gap-3 border-b border-border bg-table-header px-3 py-2 text-[12px] font-medium text-text-secondary">
          <span>{t("docPrefix")}</span>
          <span>{t("docType")}</span>
          <span>{t("docLast")}</span>
          <span className="text-right">{t("docN")}</span>
        </div>
        {view.docs.map((r) => (
          <div
            key={r.prefix}
            className="grid grid-cols-[90px_minmax(0,1fr)_180px_90px] items-center gap-3 border-b border-border px-3 py-2 text-[13px] last:border-b-0"
          >
            <span className="font-mono font-medium">{r.prefix}</span>
            <span className="text-text-secondary">{t(`doc.${r.prefix}`)}</span>
            <span className="font-mono text-[12.5px]">{r.lastNumber ?? "—"}</span>
            <span className="text-right tabular-nums">{r.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
