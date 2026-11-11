"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CircleAlert, CircleCheck, CircleX, FilePen, Info, Wallet, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DocumentHeader } from "@/components/ui/document-header";
import { HistoryTimeline } from "@/components/ui/history-timeline";
import { Modal } from "@/components/ui/modal";
import { EmptyState, ErrorState, ForbiddenState, Skeleton } from "@/components/ui/system-states";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { can } from "@/features/auth/can";
import { ensureCsrf, useMe } from "@/features/auth/session";
import { formatIsoDate, todayTashkent, useCounterparty } from "@/features/counterparties/api";
import { useBranchList } from "@/features/organization/api";
import { useOpenDocs, useSupplierOpenDocs } from "@/features/payments/api";
import { autoAlloc, cents, fromCents, gridRows, isAuto, type DocRow } from "@/features/payments/doc-model";
import { AllocTable, Steps } from "@/features/payments/payment-doc-page";
import { describeError } from "@/features/setup/form-error";
import { api, unwrap } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { formatDateTime, formatMoney } from "@/lib/format";

export type AdvSide = "CUSTOMER" | "SUPPLIER";
const PATH: Record<AdvSide, string> = { CUSTOMER: "customers", SUPPLIER: "suppliers" };

/** Taqsimot tekshiruvi (prototip `calc`): boʻsh, avansdan oshgan, hujjat qoldigʻidan oshgan. */
export function checkAdvance(docs: DocRow[], alloc: Record<string, string>, advance: string) {
  const rows = gridRows(docs, alloc);
  const total = rows.reduce((s, r) => s + cents(r.value), 0n);
  const over = rows.filter((r) => r.over).map((r) => r.doc.docNumber);
  const errors: { key: "eEmpty" | "eOver" | "eRow"; a?: string; b?: string; n?: string }[] = [];
  if (total <= 0n) errors.push({ key: "eEmpty" });
  if (total > cents(advance)) errors.push({ key: "eOver", a: fromCents(total), b: advance });
  if (over.length) errors.push({ key: "eRow", n: over.join(", ") });
  return { rows, total: fromCents(total), errors };
}

function Kpis({ items }: { items: { label: string; value: string; className?: string; href?: string; tip?: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
      {items.map((k) => (
        <div
          key={k.label}
          className="flex min-w-0 flex-col gap-1 rounded-card border border-border bg-surface px-4 py-3.5 shadow-[0_1px_2px_rgba(18,60,58,0.04)]"
        >
          <span className="text-caption font-medium text-text-secondary">{k.label}</span>
          {k.href ? (
            <Link
              href={k.href}
              title={k.tip}
              className={cn(
                "self-start text-[20px] leading-7 font-semibold tracking-[-0.02em] whitespace-nowrap tabular-nums underline decoration-border underline-offset-4 hover:text-primary",
                k.className,
              )}
            >
              {k.value}
            </Link>
          ) : (
            <span className={cn("text-[20px] leading-7 font-semibold tracking-[-0.02em] whitespace-nowrap tabular-nums", k.className)}>
              {k.value}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function InfoGrid({ title, rows }: { title: string; rows: [string, string, boolean?][] }) {
  return (
    <section className="rounded-card border border-border bg-surface p-5 shadow-[0_1px_2px_rgba(18,60,58,0.04)]">
      <h2 className="mb-3 text-subtitle">{title}</h2>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-3">
        {rows.map(([k, v, mono]) => (
          <div key={k} className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-caption text-text-secondary">{k}</dt>
            <dd className={cn("break-words", mono && "font-mono text-[13px]")}>{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function NoCash() {
  const t = useTranslations("debts.advanceDoc");
  return (
    <div className="flex items-start gap-2 px-1 text-caption text-text-secondary">
      <Info size={14} strokeWidth={1.5} className="mt-0.5 shrink-0" aria-hidden />
      <span>{t("noCash")}</span>
    </div>
  );
}

/**
 * Yangi «Avansni hisobga olish» (prototip `AdvanceDoc`): `/debts/advance/new?side=&party=&branch=`. Taqsimot avtomatik
 * (eng eski muddatdan) yoki qoʻlda; tasdiqlanganda qarz va avans oʻzgaradi, kassa/bank emas.
 */
export function AdvanceNewPage({ side, party, branch }: { side: AdvSide; party: number; branch: number }) {
  const t = useTranslations("debts.advanceDoc");
  const tp = useTranslations("payments.doc");
  const me = useMe();
  const router = useRouter();
  const qc = useQueryClient();
  const allowed = can(me.data, side === "CUSTOMER" ? "payments.mt" : "payments.yt");
  const mt = useOpenDocs(side === "CUSTOMER" ? branch : null, side === "CUSTOMER" ? party : null);
  const yt = useSupplierOpenDocs(side === "SUPPLIER" ? branch : null, side === "SUPPLIER" ? party : null);
  const open = side === "CUSTOMER" ? mt : yt;
  const cp = useCounterparty(party);
  const branches = useBranchList();
  const [alloc, setAlloc] = useState<Record<string, string> | null>(null);
  const [tried, setTried] = useState(false);
  const [vs, setVs] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  if (me.data && !allowed) return <ForbiddenState description={t("forbidden")} />;
  if (open.error) return <ErrorState error={open.error} onRetry={() => open.refetch()} />;
  if (!open.data || !me.data) return <Skeleton className="h-96" />;

  const docs: DocRow[] = open.data.docs.filter((d) => cents(d.open) > 0n);
  const advance = open.data.advance;
  const current = alloc ?? autoAlloc(docs, advance);
  const manual = !isAuto(docs, advance, current);
  const check = checkAdvance(docs, current, advance);
  const advLeft = fromCents(cents(advance) - cents(check.total));
  const debtAfter = fromCents(cents(open.data.debt) - cents(check.total));
  const name = cp.data?.name ?? "";
  const brName = branches.data?.find((b) => b.id === branch)?.name ?? "";
  const kind = side === "CUSTOMER" ? "mt" : "yt";
  const cardHref = `/debts/${PATH[side]}/${party}?name=${encodeURIComponent(name)}`;
  const err = describeError(error);

  async function post() {
    setTried(true);
    if (check.errors.length) return setVs(true);
    setPending(true);
    setError(null);
    try {
      await ensureCsrf();
      const body = {
        branchId: branch,
        counterpartyId: party,
        allocations: check.rows
          .filter((r) => cents(r.value) > 0n)
          .map((r) => ({ docType: r.doc.docType, docId: r.doc.docId, amount: fromCents(cents(r.value)) })),
      };
      const r =
        side === "CUSTOMER"
          ? await unwrap(api.POST("/api/advance-offsets/customer", { body }))
          : await unwrap(api.POST("/api/advance-offsets/supplier", { body }));
      await qc.invalidateQueries({ queryKey: ["debts"] });
      await qc.invalidateQueries({ queryKey: ["payments"] });
      toast({ tone: "success", title: t("tPosted", { n: r.number, s: formatMoney(r.amount) }) });
      router.replace(`/debts/advance/${r.id}`);
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-4 pb-6">
      <DocumentHeader
        parent={{ label: name || t("title"), href: cardHref }}
        crumb={t("new")}
        title={t("title")}
        number={t("new")}
        status={
          <Badge tone="neutral" icon={FilePen}>
            {t("st_draft")}
          </Badge>
        }
        meta={
          <Steps
            steps={[
              { label: t("st_draft"), state: "cur" },
              { label: t("st_posted"), state: "next" },
            ]}
          />
        }
        actions={
          <Button icon={Check} loading={pending} disabled={docs.length === 0} onClick={() => void post()}>
            {t("post")}
          </Button>
        }
      />
      {err.message ? <Alert tone="danger" title={err.message} /> : null}
      {tried && check.errors.length ? (
        <Alert tone="danger" title={t("vsTitle")}>
          <ul className="list-disc pl-4">
            {check.errors.map((e) => (
              <li key={e.key}>{t(e.key, { a: formatMoney(e.a ?? "0"), b: formatMoney(e.b ?? "0"), n: e.n ?? "" })}</li>
            ))}
          </ul>
        </Alert>
      ) : null}
      <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          <InfoGrid
            title={t("info")}
            rows={[
              [side === "CUSTOMER" ? t("cust") : t("sup"), name],
              ["STIR", cp.data?.tin ?? "—", true],
              [t("branch"), brName],
              [t("date"), formatIsoDate(todayTashkent())],
              [t("type"), manual ? t("manual") : t("auto")],
            ]}
          />
          <section className="min-w-0 rounded-card border border-border bg-surface shadow-[0_1px_2px_rgba(18,60,58,0.04)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3.5">
              <span className="text-[14px] font-semibold">{side === "CUSTOMER" ? t("gTitle") : t("gTitleYt")}</span>
              <div className="flex items-center gap-2">
                {manual ? (
                  <span className="inline-flex items-center gap-1 text-caption text-warning" title={t("manualTip")}>
                    <CircleAlert size={14} strokeWidth={1.5} aria-hidden />
                    {tp("manual")}
                  </span>
                ) : null}
                <Button variant="secondary" size="sm" onClick={() => setAlloc(null)} disabled={!manual}>
                  {t("autoBtn")}
                </Button>
              </div>
            </div>
            {docs.length === 0 ? (
              <EmptyState icon={CircleCheck} title={t("noOpenT")} description={t("noOpen")} />
            ) : (
              <AllocTable
                kind={kind}
                rows={check.rows}
                tried={tried}
                valLabel={t("cVal")}
                onValue={(k, v) => setAlloc({ ...current, [k]: v })}
              />
            )}
          </section>
        </div>
        <aside className="flex min-w-0 flex-col gap-3">
          <Kpis
            items={[
              { label: t("kAvail"), value: formatMoney(advance), className: "text-info" },
              {
                label: t("kAlloc"),
                value: formatMoney(check.total),
                className: cents(check.total) > cents(advance) ? "text-danger" : undefined,
              },
              { label: t("kAdvLeft"), value: formatMoney(advLeft), className: cents(advLeft) < 0n ? "text-danger" : undefined },
              { label: t("kDebtAfter"), value: formatMoney(debtAfter), href: cardHref, tip: t("openCard") },
            ]}
          />
          <NoCash />
        </aside>
      </div>
      <Modal
        open={vs}
        onClose={() => setVs(false)}
        tone="danger"
        title={t("vsTitle")}
        primaryAction={{ label: t("close"), onClick: () => setVs(false) }}
      >
        <p className="mb-3 text-text-secondary">{t("vsSub")}</p>
        <ul className="flex flex-col gap-1.5 text-danger">
          {check.errors.map((e) => (
            <li key={e.key} className="flex items-start gap-2">
              <CircleAlert size={16} strokeWidth={1.5} aria-hidden className="mt-0.5 shrink-0" />
              {t(e.key, { a: formatMoney(e.a ?? "0"), b: formatMoney(e.b ?? "0"), n: e.n ?? "" })}
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  );
}

/** Tasdiqlangan / bekor qilingan AH (prototip `AdvanceDoc`): `/debts/advance/[id]`. */
export function AdvanceViewPage({ id }: { id: number }) {
  const t = useTranslations("debts.advanceDoc");
  const me = useMe();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["debts", "advance", id],
    queryFn: () => unwrap(api.GET("/api/advance-offsets/{id}", { params: { path: { id } } })),
  });
  const cp = useCounterparty(q.data?.counterpartyId ?? null);
  const branches = useBranchList();
  const [dlg, setDlg] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data) return <Skeleton className="h-96" />;
  const d = q.data;
  const side = d.side as AdvSide;
  const posted = d.status === "POSTED";
  const cardHref = `/debts/${PATH[side]}/${d.counterpartyId}?name=${encodeURIComponent(d.counterparty)}`;
  const canCancel = posted && can(me.data, "payments.cancel");
  const err = describeError(error);

  async function cancel() {
    if (!reason.trim()) return;
    setPending(true);
    setError(null);
    try {
      await ensureCsrf();
      const r = await unwrap(api.POST("/api/advance-offsets/{id}/cancel", { params: { path: { id } }, body: { reason: reason.trim() } }));
      qc.setQueryData(["debts", "advance", id], r);
      await qc.invalidateQueries({ queryKey: ["debts"] });
      await qc.invalidateQueries({ queryKey: ["payments"] });
      setDlg(false);
      toast({ tone: "success", title: t("tCancelled", { n: r.number }) });
    } catch (e) {
      setDlg(false);
      setError(e);
    } finally {
      setPending(false);
    }
  }

  const banners: { tone: "success" | "neutral"; icon: LucideIcon; title: string; text?: string }[] = [];
  if (posted)
    banners.push({
      tone: "success",
      icon: CircleCheck,
      title: t("bPosted", { at: formatDateTime(new Date(d.createdAt)), who: d.createdBy }),
    });
  else
    banners.push({
      tone: "neutral",
      icon: CircleX,
      title: t("bCancelled", { at: d.cancelledAt ? formatDateTime(new Date(d.cancelledAt)) : "—", who: d.cancelledBy ?? "—" }),
      text: d.cancelReason ?? undefined,
    });
  const history = [
    { at: d.createdAt, employee: d.createdBy, action: "create" },
    ...(d.cancelledAt
      ? [{ at: d.cancelledAt, employee: d.cancelledBy ?? undefined, action: "cancel", reason: d.cancelReason ?? undefined }]
      : []),
  ];

  return (
    <div className="flex min-w-0 flex-col gap-4 pb-6">
      <DocumentHeader
        parent={{ label: d.counterparty, href: cardHref }}
        crumb={d.number}
        crumbMono
        title={t("title")}
        number={d.number}
        status={
          posted ? (
            <Badge tone="success" icon={CircleCheck}>
              {t("st_posted")}
            </Badge>
          ) : (
            <Badge tone="neutral" icon={CircleX}>
              {t("st_cancelled")}
            </Badge>
          )
        }
        meta={
          <Steps
            steps={
              posted
                ? [
                    { label: t("st_draft"), state: "done" },
                    { label: t("st_posted"), state: "cur" },
                  ]
                : [
                    { label: t("st_draft"), state: "done" },
                    { label: t("st_posted"), state: "done" },
                    { label: t("st_cancelled"), state: "fail" },
                  ]
            }
          />
        }
        actions={
          canCancel ? (
            <Button variant="danger" icon={CircleX} onClick={() => (setDlg(true), setReason(""))}>
              {t("cancel")}
            </Button>
          ) : null
        }
      />
      {err.message ? <Alert tone="danger" title={err.message} /> : null}
      {banners.map((b, i) => (
        <Alert key={i} tone={b.tone === "neutral" ? "warning" : b.tone} icon={b.icon} title={b.title}>
          {b.text}
        </Alert>
      ))}
      <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          <InfoGrid
            title={t("info")}
            rows={[
              [side === "CUSTOMER" ? t("cust") : t("sup"), d.counterparty],
              ["STIR", cp.data?.tin ?? "—", true],
              [t("branch"), branches.data?.find((b) => b.id === d.branchId)?.name ?? ""],
              [t("date"), formatIsoDate(d.offsetDate)],
              [t("createdBy"), d.createdBy],
            ]}
          />
          <section className="min-w-0 rounded-card border border-border bg-surface shadow-[0_1px_2px_rgba(18,60,58,0.04)]">
            <div className="border-b border-border px-4 py-3.5 text-[14px] font-semibold">{t("linesT")}</div>
            <table className="w-full border-collapse text-[13px] tabular-nums">
              <thead>
                <tr className="h-9 border-b border-border bg-table-header text-[12px] text-text-secondary">
                  <th className="px-3 text-left font-medium">{t("cDebtDoc")}</th>
                  <th className="px-3 text-left font-medium">{t("cAdvDoc")}</th>
                  <th className="px-3 text-right font-medium">{t("cSum")}</th>
                </tr>
              </thead>
              <tbody>
                {d.lines.map((l, i) => (
                  <tr key={i} className="h-11 border-b border-border">
                    <td className="px-3 font-mono text-[12.5px]">
                      {l.debtDocType === "KR" ? (
                        <Link href={`/receipts/${l.debtDocId}`} className="hover:text-primary hover:underline">
                          {l.debtDocNumber}
                        </Link>
                      ) : (
                        l.debtDocNumber
                      )}
                    </td>
                    <td className="px-3 font-mono text-[12.5px] text-text-secondary">{l.advanceDocNumber}</td>
                    <td className="px-3 text-right font-semibold">{formatMoney(l.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-end gap-2 rounded-b-card border-t border-border bg-table-header px-4 py-3.5 text-[13px]">
              <span className="text-text-secondary">{t("kAlloc")}</span>
              <span className="text-base font-semibold tabular-nums">{formatMoney(d.amount)}</span>
            </div>
          </section>
          <div className="flex flex-col gap-2">
            <span className="text-subtitle">{t("hist")}</span>
            <HistoryTimeline
              query={{ data: history, error: null, refetch: () => q.refetch() }}
              label={(a) => (a === "cancel" ? t("h_cancel") : t("h_create"))}
            />
          </div>
        </div>
        <aside className="flex min-w-0 flex-col gap-3">
          <Kpis
            items={[
              { label: t("kAlloc"), value: formatMoney(d.amount), className: posted ? undefined : "text-text-secondary line-through" },
            ]}
          />
          <Link href={cardHref} className="inline-flex items-center gap-1.5 px-1 text-caption text-primary hover:underline">
            <Wallet size={14} strokeWidth={1.5} aria-hidden />
            {t("openCard")}
          </Link>
          <NoCash />
        </aside>
      </div>
      <Modal
        open={dlg}
        onClose={() => setDlg(false)}
        tone="danger"
        title={t("cancelT")}
        primaryAction={{ label: t("cancel"), onClick: () => void cancel(), loading: pending, disabled: !reason.trim() }}
        secondaryAction={{ label: t("keep"), onClick: () => setDlg(false) }}
      >
        <p className="mb-3 text-text-secondary">{t("cancelD", { n: d.number })}</p>
        <TextField label={t("reason")} value={reason} onChange={setReason} maxLength={300} required />
      </Modal>
    </div>
  );
}
