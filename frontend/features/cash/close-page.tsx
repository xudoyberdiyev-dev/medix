"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Calculator,
  Check,
  CircleAlert,
  CircleCheck,
  CircleMinus,
  CirclePlus,
  Info,
  Layers,
  Lock,
  LockKeyhole,
  LockOpen,
  Sigma,
  TriangleAlert,
  User,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DocumentHeader } from "@/components/ui/document-header";
import { Modal } from "@/components/ui/modal";
import { ErrorState, ForbiddenState, Skeleton } from "@/components/ui/system-states";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { can } from "@/features/auth/can";
import { ensureCsrf, useMe } from "@/features/auth/session";
import { formatIsoDate } from "@/features/counterparties/api";
import { useAllAccounts } from "@/features/payments/api";
import { Steps } from "@/features/payments/payment-doc-page";
import { describeError } from "@/features/setup/form-error";
import { api, unwrap } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { formatDateTime, formatMoney } from "@/lib/format";
import { CASH_CLOSE, toCents, useClosePreview, useDayCloses } from "./api";
import {
  BANKNOTES,
  checkClose,
  closeBody,
  countedOf,
  diffOf,
  diffTone,
  hasDiff,
  type CloseError,
  type CountMode,
  type DiffTone,
} from "./close-model";
import { refreshMoney } from "./op-dialogs";

const TONE_TEXT: Record<DiffTone, string> = { success: "text-success", danger: "text-danger", warning: "text-warning" };
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function useApprovers(accountId: number | null, enabled: boolean) {
  return useQuery({
    queryKey: ["cash-close", "approvers", accountId],
    queryFn: () => unwrap(api.GET("/api/cash-close/approvers", { params: { query: { accountId: accountId as number } } })),
    enabled: enabled && accountId != null,
  });
}

/**
 * Kassa kunini yopish — toʻliq sahifa (prototip `CashClose`): `/cash/close?acct=…&date=YYYY-MM-DD`.
 * Sanoq kupyuralar boʻyicha yoki jami summa; farq boʻlsa — izoh, tasdiqlovchi (cash.closeDiff) va uning PIN kodi.
 * Farq tuzatuvchi KO bilan avtomatik yoziladi (backend). Yopilgan kun — faqat koʻrish.
 */
export function CashClosePage() {
  const t = useTranslations("cash.closePage");
  const tc = useTranslations("cash");
  const params = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const me = useMe();
  const allowed = can(me.data, CASH_CLOSE);
  const acctId = Number(params.get("acct")) || null;
  const dateParam = params.get("date");
  const date = dateParam && ISO.test(dateParam) ? dateParam : null;

  const accounts = useAllAccounts(allowed);
  const account = accounts.data?.find((a) => a.id === acctId && a.kind === "CASH") ?? null;
  const preview = useClosePreview(account ? account.id : null, date);
  const closes = useDayCloses(account?.branchId ?? null, account != null);
  const closeDate = preview.data?.closeDate ?? null;
  const rec = closes.data?.find((c) => c.accountId === acctId && c.closeDate === closeDate) ?? null;
  const closed = rec != null;

  const [mode, setMode] = useState<CountMode>("den");
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [total, setTotal] = useState("");
  const [note, setNote] = useState("");
  const [approverId, setApproverId] = useState<number | null>(null);
  const [pin, setPin] = useState("");
  const [tried, setTried] = useState(false);
  const [vs, setVs] = useState<CloseError[] | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const system = rec ? rec.expected : (preview.data?.expected ?? "0.00");
  const counted = rec ? rec.counted : countedOf(mode, counts, total);
  const diff = rec ? rec.diff : diffOf(counted, system);
  const tone = diffTone(diff);
  const withDiff = hasDiff(diff);
  const approvers = useApprovers(account?.id ?? null, withDiff && !closed);
  const errors = preview.data
    ? checkClose({
        date: preview.data.closeDate,
        lastClosed: preview.data.lastClosed ?? null,
        pendingOps: preview.data.pendingOps,
        counted,
        diff,
        note,
        approverId,
        pin,
      })
    : [];
  const fieldErr = (f: CloseError["field"]) => tried && errors.some((e) => e.field === f);

  if (me.data && !allowed) return <ForbiddenState description={t("forbidden")} />;
  if (!me.data || accounts.isPending || (account && (preview.isPending || closes.isPending))) return <Skeleton className="h-96" />;
  if (accounts.error || preview.error) return <ErrorState onRetry={() => void (accounts.refetch(), preview.refetch())} />;
  if (!account || !preview.data || !closeDate) return <Alert tone="warning" title={t("noCash")} />;

  const d = formatIsoDate(closeDate);
  const signed = (v: string) => `${toCents(v) > 0n ? "+" : ""}${formatMoney(v)}`;

  function submit() {
    setTried(true);
    if (errors.length) return setVs(errors);
    setConfirm(true);
  }

  async function run() {
    if (!account || !closeDate) return;
    setPending(true);
    setError(null);
    try {
      await ensureCsrf();
      await unwrap(
        api.POST("/api/cash-close", {
          body: {
            accountId: account.id,
            closeDate,
            ...closeBody(mode, counts, total),
            note: note.trim() || undefined,
            pin: withDiff ? pin : undefined,
            approverId: withDiff ? (approverId ?? undefined) : undefined,
          },
        }),
      );
      await refreshMoney(qc);
      await qc.invalidateQueries({ queryKey: ["cash-close"] });
      setConfirm(false);
      setPin("");
      toast({ tone: "success", title: t("tClosed", { d }) });
    } catch (e) {
      setConfirm(false);
      setPin("");
      setError(e);
    } finally {
      setPending(false);
    }
  }

  const banners: { tone: "success" | "danger" | "warning"; icon: LucideIcon; title?: string; text: string }[] = [];
  if (rec) {
    banners.push({
      tone: "success",
      icon: Lock,
      title: t("closedB", { d }),
      text:
        t("closedBy", { who: rec.closedBy, at: formatDateTime(new Date(rec.closedAt)) }) +
        (rec.approvedBy ? ` · ${t("pinBy", { who: rec.approvedBy })}` : ""),
    });
  }
  if (counted != null && tone) {
    banners.push(
      tone === "success"
        ? { tone, icon: CircleCheck, text: t("match") }
        : {
            tone,
            icon: tone === "danger" ? CircleMinus : CirclePlus,
            text: t(tone === "danger" ? "short" : "over", { s: formatMoney((diff ?? "0").replace("-", "")) }),
          },
    );
  }

  const modes: { key: CountMode; icon: LucideIcon }[] = [
    { key: "den", icon: Layers },
    { key: "total", icon: Sigma },
  ];
  const recCounts = Object.fromEntries((rec?.denominations ?? []).map((x) => [x.nominal, String(x.count)]));
  const shownCounts = rec ? recCounts : counts;
  const shownMode: CountMode = rec ? (rec.denominations.length ? "den" : "total") : mode;
  const err = describeError(error);

  return (
    <div className="flex min-w-0 flex-col gap-4 pb-20">
      <DocumentHeader
        parent={{ label: account.name, href: "/cash" }}
        crumb={d}
        crumbMono
        title={t("title")}
        number={d}
        status={
          closed ? (
            <Badge tone="success" icon={Lock}>
              {t("dayClosed")}
            </Badge>
          ) : (
            <Badge tone="info" icon={LockOpen}>
              {t("dayOpen")}
            </Badge>
          )
        }
        sub={preview.data.lastClosed && !closed ? t("lastClosed", { d: formatIsoDate(preview.data.lastClosed) }) : undefined}
        meta={
          <Steps
            steps={[
              { label: t("dayOpen"), state: closed ? "done" : "cur" },
              { label: t("dayClosed"), state: closed ? "cur" : "next" },
            ]}
          />
        }
        actions={
          closed ? null : (
            <Button icon={LockKeyhole} loading={pending} onClick={submit}>
              {t("closeBtn")}
            </Button>
          )
        }
      />
      {err.message ? <Alert tone="danger" title={err.message} /> : null}
      {!closed && preview.data.pendingOps > 0 ? <Alert tone="warning" title={t("pending", { n: preview.data.pendingOps })} /> : null}
      {banners.map((b, i) => (
        <Alert key={i} tone={b.tone} icon={b.icon} title={b.title ?? b.text}>
          {b.title ? b.text : undefined}
        </Alert>
      ))}
      {rec?.correctionNumber ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface px-4 py-3">
          <span className="text-[13px] leading-5 text-text-secondary">{t("corr", { n: rec.correctionNumber })}</span>
        </div>
      ) : null}

      <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section data-f="count" className="min-w-0 rounded-card border border-border bg-surface shadow-[0_1px_2px_rgba(18,60,58,0.04)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3.5">
            <span className={cn("text-[14px] font-semibold", fieldErr("count") && "text-danger")}>{t("count")}</span>
            <div
              role="radiogroup"
              aria-label={t("count")}
              className="flex gap-1 rounded-control border border-border bg-table-header p-[3px]"
            >
              {modes.map((m) => {
                const on = shownMode === m.key;
                return (
                  <button
                    key={m.key}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={closed}
                    onClick={() => setMode(m.key)}
                    className={cn(
                      "flex h-7 items-center gap-1.5 rounded-[6px] px-2.5 text-[13px] font-medium whitespace-nowrap",
                      on
                        ? "bg-surface text-primary shadow-[0_1px_2px_rgba(18,60,58,0.10),0_0_0_1px_var(--color-primary-button)]"
                        : "text-text-secondary",
                    )}
                  >
                    <m.icon size={14} strokeWidth={1.5} aria-hidden />
                    {t(`m_${m.key}`)}
                  </button>
                );
              })}
            </div>
          </div>
          {shownMode === "den" ? (
            <div className="overflow-x-auto">
              <div className="min-w-[420px]">
                <div className="grid h-9 grid-cols-[minmax(120px,1fr)_140px_minmax(150px,1fr)] items-center border-b border-border bg-table-header text-caption font-medium text-text-secondary">
                  <span className="px-4">{t("nominal")}</span>
                  <span className="px-3 text-right">{t("qty")}</span>
                  <span className="px-4 text-right">{t("sum")}</span>
                </div>
                {BANKNOTES.map((n) => {
                  const c = shownCounts[n] ?? "";
                  const has = /^\d+$/.test(c) && Number(c) > 0;
                  const label = formatMoney(String(n)).replace(/,00$/, "");
                  return (
                    <div
                      key={n}
                      className="grid min-h-11 grid-cols-[minmax(120px,1fr)_140px_minmax(150px,1fr)] items-center border-b border-border"
                    >
                      <span className="px-4 font-medium tabular-nums">{label}</span>
                      <span className="px-3">
                        <input
                          value={c}
                          onChange={(e) => setCounts((s) => ({ ...s, [n]: e.target.value.replace(/\D/g, "").slice(0, 5) }))}
                          readOnly={closed}
                          inputMode="numeric"
                          placeholder="0"
                          aria-label={label}
                          className={cn(
                            "h-[30px] w-full rounded-control border border-border px-2.5 text-right text-[13px] tabular-nums outline-none focus:border-primary focus:shadow-[0_0_0_3px_var(--color-focus-ring)]",
                            closed ? "bg-table-header" : "bg-surface",
                          )}
                        />
                      </span>
                      <span className={cn("px-4 text-right tabular-nums", has ? "text-text-primary" : "text-text-secondary")}>
                        {has ? formatMoney(String(n * Number(c))) : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="max-w-[360px] px-4 py-5">
              <TextField
                label={t("countTotal")}
                variant="amount"
                value={rec ? rec.counted : total}
                onChange={setTotal}
                readOnly={closed}
                suffix={tc("currency")}
                required
                error={fieldErr("count") ? t("e.count") : undefined}
              />
            </div>
          )}
          <div className="sticky bottom-[60px] z-[4] flex min-h-[52px] flex-wrap items-center justify-end gap-x-7 gap-y-2 rounded-b-card border-t border-border bg-table-header px-5 py-2.5 tabular-nums">
            <span className="flex items-baseline gap-1.5 text-[13px] leading-[18px] whitespace-nowrap">
              <span className="text-text-secondary">{t("sys")}:</span>
              <span className="font-medium">{formatMoney(system)}</span>
            </span>
            <span className="flex items-baseline gap-1.5 text-[13px] leading-[18px] whitespace-nowrap">
              <span className="text-text-secondary">{t("diff")}:</span>
              <span className="font-medium">{diff == null ? "—" : signed(diff)}</span>
            </span>
            <span className="flex items-baseline gap-2 border-l border-border pl-5 whitespace-nowrap">
              <span className="text-[13px] text-text-secondary">{t("counted")}</span>
              <span className="text-[16px] leading-[22px] font-semibold">{counted == null ? "—" : formatMoney(counted)}</span>
            </span>
          </div>
        </section>

        <aside className="flex min-w-0 flex-col gap-3">
          <div className="grid grid-cols-3 gap-3 lg:grid-cols-1">
            <Kpi label={t("sys")} value={formatMoney(system)} note={t("sysNote", { d })} />
            <Kpi label={t("counted")} value={counted == null ? "—" : formatMoney(counted)} />
            <Kpi label={t("diff")} value={diff == null ? "—" : signed(diff)} className={tone ? TONE_TEXT[tone] : undefined} />
          </div>
          {withDiff ? (
            <section data-f="note" className="flex flex-col gap-3 rounded-card border border-border bg-surface px-4 py-3.5">
              <label className="flex flex-col gap-1.5">
                <span className="text-caption font-medium">
                  {t("diffNote")} <span className="text-danger">*</span>
                </span>
                <textarea
                  value={rec ? (rec.note ?? "") : note}
                  onChange={(e) => setNote(e.target.value)}
                  readOnly={closed}
                  rows={2}
                  maxLength={500}
                  className={cn(
                    "resize-y rounded-control border bg-surface px-3 py-[7px] text-body outline-none focus:border-primary",
                    fieldErr("note") ? "border-danger" : "border-border",
                  )}
                />
              </label>
              {!closed ? (
                <div data-f="pin" className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-caption font-medium">
                      {t("pinWho")} <span className="text-danger">*</span>
                    </span>
                    {approvers.isPending ? (
                      <Skeleton className="h-8 w-40" />
                    ) : (approvers.data ?? []).length === 0 ? (
                      <span className="text-caption text-warning">{t("noApprovers")}</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {(approvers.data ?? []).map((a) => {
                          const on = approverId === a.id;
                          return (
                            <button
                              key={a.id}
                              type="button"
                              aria-pressed={on}
                              title={a.role}
                              onClick={() => setApproverId(a.id)}
                              className={cn(
                                "flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px]",
                                on ? "border-primary bg-primary-soft" : "border-border bg-surface",
                              )}
                            >
                              {on ? <Check size={14} strokeWidth={1.5} aria-hidden /> : <User size={14} strokeWidth={1.5} aria-hidden />}
                              {a.name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-caption font-medium">
                      {t("pin")} <span className="text-danger">*</span>
                    </span>
                    <input
                      type="password"
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      maxLength={6}
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="••••"
                      aria-label={t("pin")}
                      className={cn(
                        "h-[34px] w-[120px] rounded-control border px-3 font-mono text-[16px] tracking-[0.3em] outline-none focus:border-primary",
                        fieldErr("pin") ? "border-danger" : "border-border",
                      )}
                    />
                  </label>
                </div>
              ) : null}
            </section>
          ) : null}
        </aside>
      </div>

      {!closed ? (
        <div className="sticky bottom-0 z-10 -mx-6 -mb-6 flex flex-wrap items-center justify-end gap-3 border-t border-border bg-surface px-6 py-3">
          <span className="mr-auto text-caption">
            {tried && errors.length ? (
              <span className="inline-flex items-center gap-1.5 text-danger">
                <CircleAlert size={14} strokeWidth={1.5} aria-hidden />
                {t("vsTitle", { n: errors.length })}
              </span>
            ) : null}
          </span>
          <Link href="/cash" className="text-[14px] font-medium text-primary hover:underline">
            {t("back")}
          </Link>
          <Button icon={LockKeyhole} loading={pending} onClick={submit}>
            {t("closeBtn")}
          </Button>
        </div>
      ) : null}

      <Modal
        open={vs != null}
        onClose={() => setVs(null)}
        title={t("vsTitle", { n: vs?.length ?? 0 })}
        tone="danger"
        primaryAction={{ label: t("close"), onClick: () => setVs(null) }}
      >
        <p className="mb-3 text-text-secondary">{t("vsSub")}</p>
        <ul className="flex flex-col gap-1.5">
          {(vs ?? []).map((e, i) => (
            <li key={i}>
              <button
                type="button"
                className="flex items-start gap-2 text-left text-danger hover:underline"
                onClick={() => {
                  setVs(null);
                  if (e.key === "closeFirst" && e.date) {
                    router.push(`/cash/close?acct=${account.id}&date=${e.date}`);
                    return;
                  }
                  setTimeout(() => {
                    const el = document.querySelector<HTMLElement>(`[data-f="${e.field ?? "count"}"]`);
                    el?.scrollIntoView({ behavior: "smooth", block: "center" });
                    el?.querySelector<HTMLElement>("input,textarea,button")?.focus({ preventScroll: true });
                  }, 60);
                }}
              >
                <CircleAlert size={16} strokeWidth={1.5} aria-hidden className="mt-0.5 shrink-0" />
                {t(`e.${e.key}`, { d: e.date ? formatIsoDate(e.date) : "" })}
              </button>
            </li>
          ))}
        </ul>
      </Modal>

      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title={t("dCloseT", { a: account.name, d })}
        primaryAction={{ label: t("closeBtn"), onClick: () => void run(), loading: pending }}
        secondaryAction={{ label: t("back"), onClick: () => setConfirm(false) }}
      >
        <ul className="flex flex-col gap-2.5">
          <ConfirmItem icon={Calculator} text={t("dClose1", { a: formatMoney(system), b: counted == null ? "—" : formatMoney(counted) })} />
          {withDiff && tone ? (
            <>
              <ConfirmItem
                icon={TriangleAlert}
                className={TONE_TEXT[tone]}
                text={t(tone === "danger" ? "short" : "over", { s: formatMoney((diff ?? "0").replace("-", "")) })}
              />
              <ConfirmItem icon={Info} text={t("dClose2")} />
            </>
          ) : null}
          <ConfirmItem icon={Lock} text={t("dClose3", { d })} />
        </ul>
      </Modal>
    </div>
  );
}

function Kpi(props: { label: string; value: string; note?: string; className?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-card border border-border bg-surface px-4 py-3.5 shadow-[0_1px_2px_rgba(18,60,58,0.04)]">
      <span className="text-caption font-medium text-text-secondary">{props.label}</span>
      <span className={cn("text-[20px] leading-7 font-semibold tracking-[-0.02em] whitespace-nowrap tabular-nums", props.className)}>
        {props.value}
      </span>
      {props.note ? <span className="text-caption text-text-secondary">{props.note}</span> : null}
    </div>
  );
}

function ConfirmItem(props: { icon: LucideIcon; text: string; className?: string }) {
  return (
    <li className={cn("flex items-start gap-2.5 text-body", props.className)}>
      <props.icon size={16} strokeWidth={1.5} aria-hidden className="mt-0.5 shrink-0" />
      <span>{props.text}</span>
    </li>
  );
}
