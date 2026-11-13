"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleX,
  FileDown,
  Info,
  List,
  ListChecks,
  Lock,
  MessageSquareText,
  ReceiptText,
  ScanBarcode,
  ScanLine,
  ShieldCheck,
  Tag,
  Timer,
  Trash2,
  Truck,
  User,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/selection-controls";
import { Icon, type LucideIcon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/modal";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState, ErrorState, ForbiddenState, Skeleton } from "@/components/ui/system-states";
import { Tabs } from "@/components/ui/tabs";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { can } from "@/features/auth/can";
import { ensureCsrf, useMe } from "@/features/auth/session";
import { useBranches } from "@/features/employees/api";
import { describeError } from "@/features/setup/form-error";
import { api, unwrap } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import type { components } from "@/lib/api/schema";
import { cn } from "@/lib/cn";
import { formatDateTime, formatQuantity } from "@/lib/format";
import { GS, parseGs1 } from "@/lib/gs1";
import { codesExportUrl, useOrder, verifyExportUrl } from "./api";
import { IssueButton } from "./issues";
import { MarkImportButton } from "./mark-import";
import { day } from "./orders-page";
import { deliveryText, StatCards, timerText } from "./picking-page";
import { repickLines } from "./pick-sheet";
import type { OrdersT } from "./i18n";

export type MarkWork = components["schemas"]["MarkWork"];
export type MarkCode = components["schemas"]["MarkCode"];
export type UnmarkedLine = components["schemas"]["UnmarkedLine"];

/** E1: markirovkasiz qatorlar tasdig'i — «1 / 2 qator tasdiqlandi». */
export function confirmText(lines: Pick<UnmarkedLine, "confirmed">[], t: OrdersT): string {
  const done = lines.filter((l) => l.confirmed).length;
  return t("marking.confirmCounter", { done: formatQuantity(done), total: formatQuantity(lines.length) });
}

/** Hisoblagich: «10 / 10 quti · 25 / 25 dona» (SPEC 5.4). */
export function counterText(w: Pick<MarkWork, "boxesScanned" | "boxesNeeded" | "unitsScanned" | "unitsNeeded">, t: OrdersT): string {
  const parts: string[] = [];
  if (w.boxesNeeded > 0)
    parts.push(t("marking.counterBoxes", { scanned: formatQuantity(w.boxesScanned), needed: formatQuantity(w.boxesNeeded) }));
  if (w.unitsNeeded > 0)
    parts.push(t("marking.counterUnits", { scanned: formatQuantity(w.unitsScanned), needed: formatQuantity(w.unitsNeeded) }));
  return parts.join(" · ");
}

function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/** Qisqa ovoz: to'g'ri kod — qisqa baland, xato — uzun past (SPEC 5.4). Brauzer ruxsat bermasa — jim. */
function beep(ok: boolean) {
  try {
    const Ctx = window.AudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = ok ? 1200 : 220;
    osc.type = ok ? "sine" : "square";
    gain.gain.value = 0.15;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (ok ? 0.12 : 0.6));
    osc.onended = () => void ctx.close();
  } catch {
    // ovoz ixtiyoriy
  }
}

type Flash = { ok: true; title: string; detail: string } | { ok: false; title: string; detail: string };

/** Markirovkachi paneli (SPEC 5.4): Navbat, Mening markirovkam, Bugun yakunlanganlar, Kodlar jurnali. */
export function MarkingPage() {
  const t = useTranslations("orders");
  const me = useMe();
  const allowed = can(me.data, "marking.scan");
  const [tab, setTab] = useState<string | null>(null);
  const branches = useBranches();
  const mine = useQuery({
    queryKey: ["marking", "mine"],
    queryFn: async (): Promise<MarkWork | null> => {
      const r = await api.GET("/api/marking/mine");
      if (r.response.status === 204) return null;
      return unwrap(Promise.resolve(r));
    },
    enabled: allowed,
  });
  const queue = useQuery({
    queryKey: ["marking", "queue"],
    queryFn: () => unwrap(api.GET("/api/marking/queue")),
    enabled: allowed,
    refetchInterval: 15_000,
  });

  if (me.data && !allowed) return <ForbiddenState description={t("marking.forbidden")} />;
  const waiting = (queue.data ?? []).filter((o) => !o.markerId).length;
  const current = tab ?? (mine.data ? "mine" : "queue");
  const branchName = branches.data?.find((b) => b.id === me.data?.branchId)?.name;

  return (
    <>
      <h1 className="text-page-title">{t("marking.panelTitle")}</h1>
      {me.data ? <p className="mt-1 text-text-secondary">{[me.data.fullName, branchName].filter(Boolean).join(" · ")}</p> : null}
      <MarkerToday />
      <div className="mb-4">
        <Tabs
          aria-label={t("marking.tabsAria")}
          value={current}
          onChange={setTab}
          items={[
            { key: "queue", label: t("marking.tabQueue"), count: waiting || undefined },
            { key: "mine", label: t("marking.tabMine"), count: mine.data ? 1 : undefined },
            { key: "today", label: t("marking.tabToday") },
            { key: "codes", label: t("marking.tabCodes") },
          ]}
        />
      </div>
      {current === "mine" ? (
        mine.error ? (
          <ErrorState onRetry={() => mine.refetch()} />
        ) : mine.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : mine.data ? (
          <ActiveMarking work={mine.data} />
        ) : (
          <Card>
            <EmptyState
              icon={Tag}
              title={t("marking.emptyTitle")}
              description={t("marking.emptyHint")}
              action={
                <Button variant="secondary" onClick={() => setTab("queue")}>
                  {t("marking.openQueue")}
                </Button>
              }
            />
          </Card>
        )
      ) : null}
      {current === "queue" ? <Queue busy={Boolean(mine.data)} onStarted={() => setTab("mine")} /> : null}
      {current === "today" ? <CodesJournal today mine /> : null}
      {current === "codes" ? <CodesJournal today={false} mine={false} /> : null}
    </>
  );
}

function Queue({ busy, onStarted }: { busy: boolean; onStarted: () => void }) {
  const t = useTranslations("orders");
  const qc = useQueryClient();
  const queue = useQuery({ queryKey: ["marking", "queue"], queryFn: () => unwrap(api.GET("/api/marking/queue")), refetchInterval: 15_000 });
  const [pending, setPending] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);

  async function start(id: number) {
    setPending(id);
    setError(null);
    try {
      await ensureCsrf();
      const w = await unwrap(api.POST("/api/marking/orders/{id}/start", { params: { path: { id } } }));
      qc.setQueryData(["marking", "mine"], w);
      await qc.invalidateQueries({ queryKey: ["marking", "queue"] });
      onStarted();
    } catch (e) {
      setError(e);
    } finally {
      setPending(null);
    }
  }

  const err = describeError(error);
  if (queue.error) return <ErrorState error={queue.error} onRetry={() => queue.refetch()} />;
  if (queue.isPending) return <Skeleton className="h-40 w-full" />;
  const items = queue.data;
  return (
    <>
      {err.message ? <Alert tone="danger" title={err.message} className="mb-4" /> : null}
      {items.length === 0 ? (
        <Card>
          <EmptyState icon={Tag} title={t("marking.queueEmpty")} description={t("marking.queueEmptyHint")} />
        </Card>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
          {items.map((o) => (
            <MarkQueueCard key={o.id} o={o} blocked={busy} pending={pending === o.id} onStart={() => void start(o.id)} />
          ))}
        </div>
      )}
    </>
  );
}

type MarkQueueItem = components["schemas"]["MarkQueueItem"];

/** «Bugungi natijam» (prototip MarkerPanel): buyurtmalar, urilgan kodlar (quti, dona), oʻz vaqtida, kechikkan, xato urishlar. */
function MarkerToday() {
  const t = useTranslations("orders");
  const today = useQuery({
    queryKey: ["reports", "markers", "mine"],
    queryFn: () => unwrap(api.GET("/api/reports/markers/mine")),
    refetchInterval: 60_000,
  });
  if (today.error) return null;
  const r = today.data;
  const boxes = r?.boxCodes ?? 0;
  const units = (r?.codes ?? 0) - boxes;
  return (
    <StatCards
      title={t("myToday.title")}
      items={
        r
          ? [
              [t("marking.kDone"), formatQuantity(r.orders), ""],
              [t("marking.kCodes"), t("marking.boxesUnits", { boxes: formatQuantity(boxes), units: formatQuantity(units) }), ""],
              [t("picking.kOnTime"), formatQuantity(r.onTime), "text-success"],
              [t("picking.kLate"), formatQuantity(r.late), r.late > 0 ? "text-danger" : ""],
              [t("marking.kErrs"), formatQuantity(r.wrongScans ?? 0), (r.wrongScans ?? 0) > 0 ? "text-danger" : ""],
            ]
          : null
      }
    />
  );
}

/** Kerakli kodlar: «10 quti, 20 dona» (faqat borlari). */
export function needText(o: Pick<MarkQueueItem, "boxesNeeded" | "unitsNeeded">, t: OrdersT): string {
  const parts = [
    o.boxesNeeded > 0 ? t("marking.boxesN", { n: formatQuantity(o.boxesNeeded) }) : null,
    o.unitsNeeded > 0 ? t("marking.unitsN", { n: formatQuantity(o.unitsNeeded) }) : null,
  ].filter(Boolean);
  return parts.join(", ");
}

/** Navbat kartasi (prototip MarkerPanel): belgilar, nakladnoy, qatorlar, kerakli kodlar, yigʻuvchi, yetkazish; «Tafsilot» — qatorlar. */
function MarkQueueCard({ o, blocked, pending, onStart }: { o: MarkQueueItem; blocked: boolean; pending: boolean; onStart: () => void }) {
  const t = useTranslations("orders");
  const [open, setOpen] = useState(false);
  const busy = Boolean(o.markerId);
  const none = o.lines === 0;
  const meta: [LucideIcon, string, boolean][] = [
    [ReceiptText, o.invoice ? t("picking.invoiceN", { number: o.invoice }) : t("picking.noInvoice"), false],
    [List, t("marking.linesMk", { n: formatQuantity(o.lines + o.unmarkedLines), m: formatQuantity(o.lines) }), false],
    [ScanBarcode, none ? t("marking.needNone") : t("marking.need", { what: needText(o, t) }), true],
    ...(o.picker ? ([[User, t("marking.pickedBy", { name: o.picker }), false]] as [LucideIcon, string, boolean][]) : []),
    [o.deliveryType === "PICKUP" ? User : Truck, deliveryText(o, t), false],
  ];
  return (
    <article className={cn("rounded-card border border-border p-4", busy ? "bg-background" : "bg-surface")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className={cn("font-mono text-table font-semibold", busy && "text-text-secondary")}>{o.number}</div>
          <div className={cn("mt-0.5 text-subtitle", busy && "text-text-secondary")}>{o.customer}</div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {busy ? (
            <Badge tone="neutral" icon={Lock}>
              {t("marking.busy", { name: o.marker ?? "" })}
            </Badge>
          ) : null}
          <Badge tone={busy ? "neutral" : "primary"} icon={Timer}>
            {o.markMinutes != null ? t("marking.tm", { n: o.markMinutes }) : t("picking.tmWait")}
          </Badge>
          {none ? (
            <Badge tone="neutral" icon={Ban}>
              {t("marking.noneBadge")}
            </Badge>
          ) : null}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1.5 text-table text-text-secondary sm:grid-cols-3">
        {meta.map(([icon, text, strong]) => (
          <span key={text} className={cn("inline-flex items-start gap-1.5", strong && "font-semibold text-text-primary")}>
            <Icon icon={icon} size="sm" className="mt-0.5 shrink-0" />
            <span>{text}</span>
          </span>
        ))}
      </div>
      {o.note ? (
        <div className="mt-3 flex items-start gap-1.5 rounded-control bg-background px-3 py-2 text-table">
          <Icon icon={MessageSquareText} size="sm" className="mt-0.5 shrink-0 text-text-secondary" />
          <span>{o.note}</span>
        </div>
      ) : null}
      {open ? <MarkQueueLines id={o.id} /> : null}
      <div className={cn("mt-4 grid gap-2", busy ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-[2fr_3fr]")}>
        <Button variant="secondary" size="lg" icon={open ? ChevronUp : ChevronDown} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? t("picking.hide") : t("picking.details")}
        </Button>
        {busy ? null : blocked ? (
          <span className="inline-flex items-center gap-1.5 text-table text-text-secondary">
            <Icon icon={Info} size="sm" />
            {t("marking.oneActive")}
          </span>
        ) : (
          <Button size="lg" icon={none ? Check : ScanBarcode} loading={pending} onClick={onStart}>
            {none ? t("marking.noneBtn") : t("marking.start")}
          </Button>
        )}
      </div>
    </article>
  );
}

/** «Tafsilot»: buyurtma qatorlari (markirovkali — belgi bilan). */
function MarkQueueLines({ id }: { id: number }) {
  const t = useTranslations("orders");
  const order = useOrder(id);
  if (order.error) return <ErrorState error={order.error} onRetry={() => order.refetch()} />;
  if (!order.data) return <Skeleton className="mt-3 h-16 w-full" />;
  return (
    <ul className="mt-3 flex flex-col border-t border-border">
      {repickLines(order.data).map((l) => (
        <li key={l.id} className="flex items-start justify-between gap-3 border-b border-border py-2 text-table">
          <span className="inline-flex items-start gap-1.5">
            {l.marked ? <Icon icon={ScanBarcode} size="sm" className="mt-0.5 shrink-0 text-primary" /> : null}
            <span>
              <span className="font-mono text-text-secondary">{l.productCode}</span> {l.productName}
            </span>
          </span>
          <span className="font-semibold whitespace-nowrap tabular-nums">{t("picking.qty", { qty: formatQuantity(l.qty) })}</span>
        </li>
      ))}
    </ul>
  );
}

function ActiveMarking({ work }: { work: MarkWork }) {
  const tr = useTranslations("orders");
  const qc = useQueryClient();
  const now = useNow();
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [flash, setFlash] = useState<Flash | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<unknown>(null);
  const [removing, setRemoving] = useState<MarkCode | null>(null);
  const [reason, setReason] = useState("");
  const [removeError, setRemoveError] = useState<unknown>(null);
  const [removePending, setRemovePending] = useState(false);
  const [confirming, setConfirming] = useState<number | "all" | null>(null);
  const [confirmError, setConfirmError] = useState<unknown>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const exportedAt = work.exportedAt ?? null;
  // O10a: tasdiq aynan shu yuklab olingan faylga tegishli — yangi kod qabul qilinsa (fayl qayta kerak) belgi oʻzi tushadi
  const [verifiedFor, setVerifiedFor] = useState<string | null>(null);
  const verified = exportedAt !== null && verifiedFor === exportedAt;
  const hasMarked = work.lines.length > 0;
  const hasCodes = work.codes.length > 0;
  const unconfirmed = work.unmarkedLines.filter((l) => !l.confirmed);
  const t = work.deadline ? timerText(new Date(work.deadline), now, tr) : null;

  // Doimiy fokus: skaner klaviatura rejimida — maydon har doim tayyor turadi (oyna ochiq bo'lmasa).
  useEffect(() => {
    if (removing) return;
    const keep = () => {
      if (document.querySelector("dialog[open]")) return;
      if (document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") input.current?.focus();
    };
    keep();
    const id = setInterval(keep, 1000);
    return () => clearInterval(id);
  }, [removing]);

  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(null), flash.ok ? 900 : 3000);
    return () => clearTimeout(id);
  }, [flash]);

  function show(f: Flash) {
    setFlash(f);
    beep(f.ok);
  }

  // Skaner kodlarni ketma-ket tez yuboradi: oldingi soʻrov tugamaguncha kelgan kod tashlab yuborilmaydi — navbatga qoʻyiladi.
  const queue = useRef<Promise<void>>(Promise.resolve());
  const [queued, setQueued] = useState(0);

  function scan(raw: string) {
    if (!raw.trim()) return;
    setQueued((n) => n + 1);
    queue.current = queue.current.then(() => scanOne(raw)).finally(() => setQueued((n) => n - 1));
  }

  async function scanOne(raw: string) {
    const parsed = parseGs1(raw);
    if (!parsed.ok) {
      show({
        ok: false,
        title: tr("marking.rejected"),
        detail: tr(`gs1.${parsed.error.slice("marking.".length) as "format" | "gtinInvalid" | "kindInvalid" | "expiryInvalid"}`),
      });
      return;
    }
    try {
      await ensureCsrf();
      const r = await unwrap(api.POST("/api/marking/orders/{id}/scan", { params: { path: { id: work.id } }, body: { code: raw } }));
      qc.setQueryData(["marking", "mine"], r.work);
      show({ ok: true, title: tr("marking.accepted"), detail: `${r.accepted.productName} · ${counterText(r.work, tr)}` });
    } catch (e) {
      show({ ok: false, title: tr("marking.rejected"), detail: e instanceof ApiError ? e.message : (describeError(e).message ?? "") });
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    // Ba'zi skanerlar FNC1 ni Ctrl+] sifatida yuboradi
    if (e.ctrlKey && e.key === "]") {
      e.preventDefault();
      setValue((v) => v + GS);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const raw = value;
      setValue("");
      scan(raw);
    }
  }

  /** O10a «Excelʼga chiqarish»: Saplayn tekshiruvi fayli; yuklab olingani serverda qayd etiladi. */
  async function exportForVerify() {
    setExporting(true);
    setExportError(null);
    try {
      const res = await fetch(verifyExportUrl(work.id), { credentials: "same-origin" });
      if (!res.ok) throw new Error(String(res.status));
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? `saplayn-${work.number}.xlsx`;
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
      await qc.invalidateQueries({ queryKey: ["marking", "mine"] });
    } catch {
      setExportError(tr("marking.verifyExportFailed"));
    } finally {
      setExporting(false);
    }
  }

  async function finish() {
    setFinishing(true);
    setFinishError(null);
    try {
      await ensureCsrf();
      const w = await unwrap(
        api.POST("/api/marking/orders/{id}/finish", { params: { path: { id: work.id } }, body: { verified: hasCodes && verified } }),
      );
      toast({ tone: "success", title: tr("marking.finished"), description: tr("marking.finishedHint", { number: w.number }) });
      qc.setQueryData(["marking", "mine"], null);
      await qc.invalidateQueries({ queryKey: ["marking"] });
      await qc.invalidateQueries({ queryKey: ["orders"] });
    } catch (e) {
      setFinishError(e);
    } finally {
      setFinishing(false);
    }
  }

  /** E1: markirovkasiz qatorni (yoki hammasini) «Tasdiqlash». */
  async function confirm(ids: number[], key: number | "all") {
    setConfirming(key);
    setConfirmError(null);
    try {
      await ensureCsrf();
      const w = await unwrap(api.POST("/api/marking/orders/{id}/confirm", { params: { path: { id: work.id } }, body: { lineIds: ids } }));
      qc.setQueryData(["marking", "mine"], w);
    } catch (e) {
      setConfirmError(e);
    } finally {
      setConfirming(null);
    }
  }

  async function remove() {
    if (!removing) return;
    setRemovePending(true);
    setRemoveError(null);
    try {
      await ensureCsrf();
      const w = await unwrap(
        api.POST("/api/marking/orders/{id}/codes/{markId}/remove", {
          params: { path: { id: work.id, markId: removing.id } },
          body: { reason: reason.trim() },
        }),
      );
      qc.setQueryData(["marking", "mine"], w);
      setRemoving(null);
      setReason("");
    } catch (e) {
      setRemoveError(e);
    } finally {
      setRemovePending(false);
    }
  }

  const finishErr = describeError(finishError);
  const removeErr = describeError(removeError);
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[2fr_1fr]">
      {flash ? (
        <div
          role={flash.ok ? "status" : "alert"}
          onClick={() => setFlash(null)}
          className={`fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 p-6 text-center ${
            flash.ok ? "bg-success text-white" : "bg-danger text-white"
          }`}
        >
          {flash.ok ? <CheckCircle2 size={96} strokeWidth={1.5} aria-hidden /> : <CircleX size={96} strokeWidth={1.5} aria-hidden />}
          <div className="text-page-title">{flash.title}</div>
          <div className="max-w-xl text-subtitle">{flash.detail}</div>
        </div>
      ) : null}
      <section>
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="font-mono text-subtitle">{work.number}</div>
              <div>{work.customer}</div>
              <div className="mt-1 text-subtitle tabular-nums" aria-live="polite">
                {counterText(work, tr)}
              </div>
            </div>
            {t ? (
              <div className={`flex items-center gap-2 text-page-title tabular-nums ${t.late ? "text-danger" : ""}`} role="timer">
                <Timer size={24} strokeWidth={1.5} aria-hidden />
                {t.text}
              </div>
            ) : null}
          </div>
          {work.unmarkedOnly ? (
            <div className="mt-3">
              <Badge tone="neutral" icon={ListChecks}>
                {tr("marking.unmarkedOnly")}
              </Badge>
            </div>
          ) : null}
          {hasMarked ? (
            <label className="mt-4 block">
              <span className="mb-1 flex items-center gap-2 text-caption text-text-secondary">
                <ScanLine size={16} strokeWidth={1.5} aria-hidden /> {tr("marking.scanField")}
                {queued > 1 ? <span aria-live="polite">{tr("marking.checking", { count: queued })}</span> : null}
              </span>
              <input
                ref={input}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={onKeyDown}
                autoComplete="off"
                spellCheck={false}
                aria-label={tr("marking.codeAria")}
                className="h-12 w-full rounded-control border border-border bg-surface px-3 font-mono focus:border-primary focus:outline-none"
              />
            </label>
          ) : null}
          <ul className="mt-4 flex flex-col">
            {work.lines.map((l) => (
              <li key={l.lineId} className="border-t border-border py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="font-mono text-text-secondary">{l.productCode}</span> {l.productName}
                  </div>
                  <div className={`text-subtitle tabular-nums ${l.scanned === l.qty ? "text-success" : ""}`}>
                    {formatQuantity(l.scanned)} / {formatQuantity(l.qty)} {tr(`kind.${l.kind}`)}
                  </div>
                </div>
                <div className="text-caption text-text-secondary">
                  {l.batches
                    .map((b) => `${b.batch} · ${day(b.expiryDate)} — ${formatQuantity(b.scanned)} / ${formatQuantity(b.qty)}`)
                    .join("; ")}
                </div>
              </li>
            ))}
          </ul>
          {work.unmarkedLines.length > 0 ? (
            <section aria-label={tr("marking.unmarkedTitle")} className="mt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-subtitle">{tr("marking.unmarkedTitle")}</h3>
                <span className="text-caption text-text-secondary tabular-nums" aria-live="polite">
                  {confirmText(work.unmarkedLines, tr)}
                </span>
              </div>
              <p className="text-caption text-text-secondary">{tr("marking.unmarkedHint")}</p>
              <ul className="mt-2 flex flex-col">
                {work.unmarkedLines.map((l) => (
                  <li key={l.lineId} className="flex items-center justify-between gap-3 border-t border-border py-3">
                    <div>
                      <span className="font-mono text-text-secondary">{l.productCode}</span> {l.productName}
                      <div className="text-caption text-text-secondary tabular-nums">
                        {formatQuantity(l.qty)} {l.unit}
                      </div>
                    </div>
                    {l.confirmed ? (
                      <Badge tone="success" icon={CheckCircle2}>
                        {tr("marking.confirmed")}
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={Check}
                        loading={confirming === l.lineId}
                        disabled={confirming !== null}
                        onClick={() => void confirm([l.lineId], l.lineId)}
                      >
                        {tr("marking.confirm")}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
              {unconfirmed.length > 1 ? (
                <div className="mt-2 flex justify-end">
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={ListChecks}
                    loading={confirming === "all"}
                    disabled={confirming !== null}
                    onClick={() =>
                      void confirm(
                        unconfirmed.map((l) => l.lineId),
                        "all",
                      )
                    }
                  >
                    {tr("marking.confirmAll", { count: formatQuantity(unconfirmed.length) })}
                  </Button>
                </div>
              ) : null}
              {describeError(confirmError).message ? (
                <Alert tone="danger" title={describeError(confirmError).message ?? ""} className="mt-2" />
              ) : null}
            </section>
          ) : null}
          {hasCodes && work.complete ? (
            <section className="mt-4 rounded-card border border-border p-3" aria-label={tr("marking.verifyTitle")}>
              <h3 className="flex items-center gap-1.5 font-semibold">
                <Icon icon={ShieldCheck} size="sm" /> {tr("marking.verifyTitle")}
              </h3>
              <p className="mt-1 text-caption text-text-secondary">{tr("marking.verifyHint")}</p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Button variant="secondary" icon={FileDown} loading={exporting} onClick={() => void exportForVerify()}>
                  {tr("marking.verifyExport")}
                </Button>
                <span className={cn("inline-flex items-center gap-1 text-caption", exportedAt ? "text-success" : "text-text-secondary")}>
                  <Icon icon={exportedAt ? CheckCircle2 : Info} size="sm" />
                  {exportedAt
                    ? tr("marking.verifyExported", { time: formatDateTime(new Date(exportedAt)) })
                    : tr("marking.verifyNotExported")}
                </span>
              </div>
              {exportError ? <Alert tone="danger" title={exportError} className="mt-2" /> : null}
              <Checkbox
                className="mt-3"
                label={tr("marking.verifyCheck")}
                checked={verified}
                disabled={!exportedAt}
                onChange={(v) => setVerifiedFor(v ? exportedAt : null)}
              />
            </section>
          ) : null}
          {finishErr.message ? <Alert tone="danger" title={finishErr.message} className="mt-3" /> : null}
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <IssueButton orderId={work.id} />
            {hasMarked && !work.complete ? <MarkImportButton orderId={work.id} /> : null}
            <Button
              icon={CheckCircle2}
              disabled={!work.complete || (hasCodes && (!exportedAt || !verified))}
              loading={finishing}
              onClick={() => void finish()}
            >
              {hasCodes ? tr("marking.verifyFinish") : tr("marking.finish")}
            </Button>
          </div>
        </Card>
      </section>
      <section>
        <h2 className="mb-3 text-subtitle">{tr("marking.scanned")}</h2>
        {work.codes.length === 0 ? (
          <p className="text-text-secondary">{tr("marking.noCodes")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {work.codes.map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-2 rounded-card border border-border bg-surface p-2">
                <div className="min-w-0">
                  <div className="truncate">{c.productName}</div>
                  <div className="truncate font-mono text-caption text-text-secondary">
                    {c.serial} · {c.batch} · {tr(`kind.${c.kind}`)}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="tertiary"
                  icon={Trash2}
                  aria-label={tr("marking.removeAria", { serial: c.serial })}
                  onClick={() => {
                    setRemoving(c);
                    setRemoveError(null);
                  }}
                >
                  {tr("marking.remove")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <Modal
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={tr("marking.removeTitle")}
        tone="danger"
        primaryAction={{ label: tr("marking.remove"), onClick: () => void remove(), loading: removePending, disabled: !reason.trim() }}
      >
        <p className="mb-3">
          {removing?.productName} · <span className="font-mono">{removing?.serial}</span> {tr("marking.removeText")}
        </p>
        <TextField label={tr("marking.reason")} value={reason} onChange={setReason} maxLength={300} error={removeErr.fields.reason} />
        <Button size="sm" variant="tertiary" className="mt-2" onClick={() => setReason(tr("marking.reasonSaplayn"))}>
          {tr("marking.reasonSaplayn")}
        </Button>
        {removeErr.message ? <Alert tone="danger" title={removeErr.message} className="mt-3" /> : null}
      </Modal>
    </div>
  );
}

const STATUS_TONE: Record<MarkCode["status"], "success" | "neutral" | "warning" | "info"> = {
  ACTIVE: "info",
  REMOVED: "warning",
  RELEASED: "neutral",
  SOLD: "success",
};

function CodesJournal({ today, mine }: { today: boolean; mine: boolean }) {
  const t = useTranslations("orders");
  const me = useMe();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const codes = useQuery({
    queryKey: ["marking", "codes", { today, mine, q, page }],
    queryFn: () =>
      unwrap(api.GET("/api/marking/codes", { params: { query: { today, mine, q: q.trim() || undefined, page: page - 1, size: 50 } } })),
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div className="w-full max-w-md">
          <TextField
            label={t("marking.search")}
            variant="search"
            value={q}
            onChange={(v) => {
              setQ(v);
              setPage(1);
            }}
            placeholder={t("marking.searchPlaceholder")}
            className="[&>label]:sr-only"
          />
        </div>
        {can(me.data, "marking.export") ? (
          <a
            href={codesExportUrl({ today, mine, q })}
            download
            className="inline-flex h-control-md shrink-0 items-center gap-2 rounded-control border border-border bg-surface px-4 font-medium hover:bg-background"
          >
            <FileDown size={16} strokeWidth={1.5} aria-hidden />
            {t("marking.excel")}
          </a>
        ) : null}
      </div>
      {codes.error ? (
        <ErrorState onRetry={() => codes.refetch()} />
      ) : codes.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : codes.data.items.length === 0 ? (
        <Card>
          <EmptyState
            icon={ScanLine}
            title={t("marking.notFound")}
            description={today ? t("marking.notFoundToday") : t("marking.notFoundHint")}
          />
        </Card>
      ) : (
        <>
          <div className="overflow-x-auto rounded-card border border-border bg-surface">
            <table className="w-full text-left">
              <thead className="bg-table-header text-caption text-text-secondary">
                <tr>
                  <th className="px-3 py-2">{t("marking.col.time")}</th>
                  <th className="px-3 py-2">{t("marking.col.order")}</th>
                  <th className="px-3 py-2">{t("marking.col.product")}</th>
                  <th className="px-3 py-2">{t("marking.col.serial")}</th>
                  <th className="px-3 py-2">{t("marking.col.status")}</th>
                  <th className="px-3 py-2">{t("marking.col.who")}</th>
                </tr>
              </thead>
              <tbody>
                {codes.data.items.map((c) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="px-3 py-2 tabular-nums">{formatDateTime(new Date(c.scannedAt))}</td>
                    <td className="px-3 py-2 font-mono">{c.orderNumber}</td>
                    <td className="px-3 py-2">{c.productName}</td>
                    <td className="px-3 py-2 font-mono" title={c.code}>
                      {c.serial} · {c.batch} · {t(`kind.${c.kind}`)}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={STATUS_TONE[c.status]}>{t(`marking.codeStatus.${c.status}`)}</Badge>
                      {c.closeReason ? <div className="text-caption text-text-secondary">{c.closeReason}</div> : null}
                    </td>
                    <td className="px-3 py-2">{c.scannedBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3">
            <Pagination
              page={page}
              pageSize={50}
              total={codes.data.total}
              onPageChange={setPage}
              onPageSizeChange={() => undefined}
              pageSizeOptions={[50]}
            />
          </div>
        </>
      )}
    </>
  );
}
