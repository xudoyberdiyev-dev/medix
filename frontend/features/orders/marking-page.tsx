"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CircleX, Play, ScanLine, Tag, Timer, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState, ErrorState, ForbiddenState, Skeleton } from "@/components/ui/system-states";
import { Tabs } from "@/components/ui/tabs";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { can } from "@/features/auth/can";
import { ensureCsrf, useMe } from "@/features/auth/session";
import { describeError } from "@/features/setup/form-error";
import { api, unwrap } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import type { components } from "@/lib/api/schema";
import { formatDateTime, formatQuantity } from "@/lib/format";
import { GS, GS1_ERROR_TEXT, parseGs1 } from "@/lib/gs1";
import { day } from "./orders-page";
import { timerText } from "./picking-page";

export type MarkWork = components["schemas"]["MarkWork"];
export type MarkCode = components["schemas"]["MarkCode"];

const KIND: Record<MarkWork["lines"][number]["kind"], string> = { BOX: "quti", UNIT: "dona" };

/** Hisoblagich: «10 / 10 quti · 25 / 25 dona» (SPEC 5.4). */
export function counterText(w: Pick<MarkWork, "boxesScanned" | "boxesNeeded" | "unitsScanned" | "unitsNeeded">): string {
  const parts: string[] = [];
  if (w.boxesNeeded > 0) parts.push(`${formatQuantity(w.boxesScanned)} / ${formatQuantity(w.boxesNeeded)} quti`);
  if (w.unitsNeeded > 0) parts.push(`${formatQuantity(w.unitsScanned)} / ${formatQuantity(w.unitsNeeded)} dona`);
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
  const me = useMe();
  const allowed = can(me.data, "marking.scan");
  const [tab, setTab] = useState("mine");
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

  if (me.data && !allowed) return <ForbiddenState description="Markirovka paneli faqat markirovkachilar uchun." />;
  const waiting = (queue.data ?? []).filter((o) => !o.markerId).length;

  return (
    <>
      <h1 className="mb-4 text-page-title">Markirovka</h1>
      <div className="mb-4">
        <Tabs
          aria-label="Markirovka boʻlimlari"
          value={tab}
          onChange={setTab}
          items={[
            { key: "mine", label: "Mening markirovkam" },
            { key: "queue", label: "Navbat", count: waiting },
            { key: "today", label: "Bugun yakunlanganlar" },
            { key: "codes", label: "Kodlar jurnali" },
          ]}
        />
      </div>
      {tab === "mine" ? (
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
              title="Faol markirovka yoʻq"
              description="«Navbat» boʻlimidan buyurtma tanlab, «Markirovkani boshlash»ni bosing."
              action={
                <Button variant="secondary" onClick={() => setTab("queue")}>
                  Navbatni ochish
                </Button>
              }
            />
          </Card>
        )
      ) : null}
      {tab === "queue" ? <Queue busy={Boolean(mine.data)} onStarted={() => setTab("mine")} /> : null}
      {tab === "today" ? <CodesJournal today mine /> : null}
      {tab === "codes" ? <CodesJournal today={false} mine={false} /> : null}
    </>
  );
}

function Queue({ busy, onStarted }: { busy: boolean; onStarted: () => void }) {
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
  if (queue.error) return <ErrorState onRetry={() => queue.refetch()} />;
  if (queue.isPending) return <Skeleton className="h-40 w-full" />;
  const items = queue.data;
  return (
    <>
      {err.message ? <Alert tone="danger" title={err.message} className="mb-4" /> : null}
      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon={Tag}
            title="Navbat boʻsh"
            description="Yigʻuvchi markirovkali buyurtmani yakunlaganda shu yerda paydo boʻladi."
          />
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map((o) => (
            <li key={o.id} className="rounded-card border border-border bg-surface p-3">
              <div className="font-mono">{o.number}</div>
              <div className="mt-1">{o.customer}</div>
              <div className="mt-1 text-caption text-text-secondary">
                {formatQuantity(o.lines)} xil · {formatQuantity(o.totalQty)} ta kod · vaqt {o.markMinutes ?? "—"} daqiqa
              </div>
              <div className="mt-2">
                {o.markerId ? (
                  <Badge tone="warning">Band: {o.marker}</Badge>
                ) : (
                  <Button size="sm" icon={Play} disabled={busy} loading={pending === o.id} onClick={() => void start(o.id)}>
                    Markirovkani boshlash
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function ActiveMarking({ work }: { work: MarkWork }) {
  const qc = useQueryClient();
  const now = useNow();
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [flash, setFlash] = useState<Flash | null>(null);
  const [scanning, setScanning] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<unknown>(null);
  const [removing, setRemoving] = useState<MarkCode | null>(null);
  const [reason, setReason] = useState("");
  const [removeError, setRemoveError] = useState<unknown>(null);
  const [removePending, setRemovePending] = useState(false);
  const t = work.deadline ? timerText(new Date(work.deadline), now) : null;

  // Doimiy fokus: skaner klaviatura rejimida — maydon har doim tayyor turadi (oyna ochiq bo'lmasa).
  useEffect(() => {
    if (removing) return;
    const keep = () => {
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

  async function scan(raw: string) {
    if (!raw.trim() || scanning) return;
    const parsed = parseGs1(raw);
    if (!parsed.ok) {
      show({ ok: false, title: "Kod qabul qilinmadi", detail: GS1_ERROR_TEXT[parsed.error] });
      return;
    }
    setScanning(true);
    try {
      await ensureCsrf();
      const r = await unwrap(api.POST("/api/marking/orders/{id}/scan", { params: { path: { id: work.id } }, body: { code: raw } }));
      qc.setQueryData(["marking", "mine"], r.work);
      show({ ok: true, title: "Qabul qilindi", detail: `${r.accepted.productName} · ${counterText(r.work)}` });
    } catch (e) {
      show({ ok: false, title: "Kod qabul qilinmadi", detail: e instanceof ApiError ? e.message : (describeError(e).message ?? "") });
    } finally {
      setScanning(false);
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
      void scan(raw);
    }
  }

  async function finish() {
    setFinishing(true);
    setFinishError(null);
    try {
      await ensureCsrf();
      const w = await unwrap(api.POST("/api/marking/orders/{id}/finish", { params: { path: { id: work.id } } }));
      toast({ tone: "success", title: "Markirovka yakunlandi", description: `${w.number} · hisobdan oʻtkazishga yuborildi` });
      qc.setQueryData(["marking", "mine"], null);
      await qc.invalidateQueries({ queryKey: ["marking"] });
      await qc.invalidateQueries({ queryKey: ["orders"] });
    } catch (e) {
      setFinishError(e);
    } finally {
      setFinishing(false);
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
                {counterText(work)}
              </div>
            </div>
            {t ? (
              <div className={`flex items-center gap-2 text-page-title tabular-nums ${t.late ? "text-danger" : ""}`} role="timer">
                <Timer size={24} strokeWidth={1.5} aria-hidden />
                {t.text}
              </div>
            ) : null}
          </div>
          <label className="mt-4 block">
            <span className="mb-1 flex items-center gap-2 text-caption text-text-secondary">
              <ScanLine size={16} strokeWidth={1.5} aria-hidden /> Skanerlash maydoni — kodni skanerlang (Enter bilan tugaydi)
            </span>
            <input
              ref={input}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={onKeyDown}
              autoComplete="off"
              spellCheck={false}
              aria-label="Markirovka kodi"
              className="h-12 w-full rounded-control border border-border bg-surface px-3 font-mono focus:border-primary focus:outline-none"
            />
          </label>
          <ul className="mt-4 flex flex-col">
            {work.lines.map((l) => (
              <li key={l.lineId} className="border-t border-border py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="font-mono text-text-secondary">{l.productCode}</span> {l.productName}
                  </div>
                  <div className={`text-subtitle tabular-nums ${l.scanned === l.qty ? "text-success" : ""}`}>
                    {formatQuantity(l.scanned)} / {formatQuantity(l.qty)} {KIND[l.kind]}
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
          {finishErr.message ? <Alert tone="danger" title={finishErr.message} className="mt-3" /> : null}
          <div className="mt-4 flex justify-end">
            <Button icon={CheckCircle2} disabled={!work.complete} loading={finishing} onClick={() => void finish()}>
              Markirovkani yakunlash
            </Button>
          </div>
        </Card>
      </section>
      <section>
        <h2 className="mb-3 text-subtitle">Skanerlangan kodlar</h2>
        {work.codes.length === 0 ? (
          <p className="text-text-secondary">Hali kod yoʻq.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {work.codes.map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-2 rounded-card border border-border bg-surface p-2">
                <div className="min-w-0">
                  <div className="truncate">{c.productName}</div>
                  <div className="truncate font-mono text-caption text-text-secondary">
                    {c.serial} · {c.batch} · {KIND[c.kind]}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="tertiary"
                  icon={Trash2}
                  aria-label={`Kodni olib tashlash: ${c.serial}`}
                  onClick={() => {
                    setRemoving(c);
                    setRemoveError(null);
                  }}
                >
                  Olib tashlash
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <Modal
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title="Kodni olib tashlash"
        tone="danger"
        primaryAction={{ label: "Olib tashlash", onClick: () => void remove(), loading: removePending, disabled: !reason.trim() }}
      >
        <p className="mb-3">
          {removing?.productName} · <span className="font-mono">{removing?.serial}</span> — kod buyurtmadan olib tashlanadi va tarixda
          qoladi.
        </p>
        <TextField label="Sabab" value={reason} onChange={setReason} maxLength={300} error={removeErr.fields.reason} />
        {removeErr.message ? <Alert tone="danger" title={removeErr.message} className="mt-3" /> : null}
      </Modal>
    </div>
  );
}

const STATUS_LABEL: Record<MarkCode["status"], string> = {
  ACTIVE: "Buyurtmada",
  REMOVED: "Olib tashlangan",
  RELEASED: "Boʻshatilgan",
  SOLD: "Sotilgan",
};

const STATUS_TONE: Record<MarkCode["status"], "success" | "neutral" | "warning" | "info"> = {
  ACTIVE: "info",
  REMOVED: "warning",
  RELEASED: "neutral",
  SOLD: "success",
};

function CodesJournal({ today, mine }: { today: boolean; mine: boolean }) {
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
      <div className="mb-4 max-w-md">
        <TextField
          label="Qidiruv"
          variant="search"
          value={q}
          onChange={(v) => {
            setQ(v);
            setPage(1);
          }}
          placeholder="GTIN, seriya, partiya yoki buyurtma raqami"
        />
      </div>
      {codes.error ? (
        <ErrorState onRetry={() => codes.refetch()} />
      ) : codes.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : codes.data.items.length === 0 ? (
        <Card>
          <EmptyState
            icon={ScanLine}
            title="Kod topilmadi"
            description={today ? "Bugun hali kod skanerlanmagan." : "Qidiruvni oʻzgartirib koʻring."}
          />
        </Card>
      ) : (
        <>
          <div className="overflow-x-auto rounded-card border border-border bg-surface">
            <table className="w-full text-left">
              <thead className="bg-table-header text-caption text-text-secondary">
                <tr>
                  <th className="px-3 py-2">Vaqt</th>
                  <th className="px-3 py-2">Buyurtma</th>
                  <th className="px-3 py-2">Mahsulot</th>
                  <th className="px-3 py-2">Seriya · partiya</th>
                  <th className="px-3 py-2">Holat</th>
                  <th className="px-3 py-2">Kim</th>
                </tr>
              </thead>
              <tbody>
                {codes.data.items.map((c) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="px-3 py-2 tabular-nums">{formatDateTime(new Date(c.scannedAt))}</td>
                    <td className="px-3 py-2 font-mono">{c.orderNumber}</td>
                    <td className="px-3 py-2">{c.productName}</td>
                    <td className="px-3 py-2 font-mono" title={c.code}>
                      {c.serial} · {c.batch} · {KIND[c.kind]}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</Badge>
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
