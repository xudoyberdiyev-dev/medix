"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  CircleCheck,
  CircleX,
  FileText,
  type LucideIcon,
  PackageMinus,
  PackageOpen,
  RotateCcw,
  ShieldAlert,
  Truck,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Drawer } from "@/components/ui/drawer";
import { Spinner } from "@/components/ui/spinner";
import { ErrorState } from "@/components/ui/system-states";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { cn } from "@/lib/cn";
import { formatDate, formatMoney, formatQuantity } from "@/lib/format";

type BatchCard = components["schemas"]["BatchCard"];

export type BatchState = "open" | "quar" | "recv" | "ship" | "expired";

const STATE: Record<BatchState, { icon: LucideIcon; tone: "success" | "warning" | "neutral" | "danger" }> = {
  open: { icon: CircleCheck, tone: "success" },
  quar: { icon: ShieldAlert, tone: "warning" },
  recv: { icon: PackageOpen, tone: "neutral" },
  ship: { icon: Truck, tone: "neutral" },
  expired: { icon: CircleX, tone: "danger" },
};

/** Prototip `BatchPanel` holati: muddati oʻtgan → zona turi boʻyicha. */
export function batchState(b: Pick<BatchCard, "expired" | "zoneType">): BatchState {
  if (b.expired) return "expired";
  if (b.zoneType === "QUARANTINE") return "quar";
  if (b.zoneType === "RECEIVING") return "recv";
  if (b.zoneType === "SHIPPING") return "ship";
  return "open";
}

const DAY = 86_400_000;
const isoDay = (iso: string) => Date.parse(`${iso}T00:00:00+05:00`);
const day = (iso: string) => formatDate(new Date(`${iso}T00:00:00+05:00`));

/** Yaroqlilik muddatining oʻtgan ulushi (%): ishlab chiqarilgan → yaroqlilik; sana yoʻq boʻlsa 0, oʻtgan boʻlsa 100. */
export function lifeUsed(producedOn: string | null | undefined, expiry: string, now: number): number {
  const e = isoDay(expiry);
  if (now >= e) return 100;
  if (!producedOn) return 0;
  const m = isoDay(producedOn);
  if (e <= m) return 100;
  return Math.max(0, Math.min(100, Math.round(((now - m) / (e - m)) * 100)));
}

export function daysLeft(expiry: string, now: number): number {
  return Math.floor((isoDay(expiry) - now) / DAY);
}

/** Harakat hujjatiga havola (hujjat turi boʻyicha); nomaʼlum tur — havolasiz. */
export function moveHref(docType: string, docId: number): string | null {
  switch (docType) {
    case "KR":
      return `/receipts/${docId}`;
    case "BY":
      return `/orders/${docId}`;
    case "ZK":
      return `/zone-transfers?open=${docId}`;
    case "OK":
      return `/warehouse-transfers?open=${docId}`;
    case "HC":
      return `/write-offs?open=${docId}`;
    case "QY":
      return `/supplier-returns?open=${docId}`;
    case "IN":
      return `/inventory-counts?open=${docId}`;
    case "FS":
      return `/branch-sales?open=${docId}`;
    default:
      return null;
  }
}

const DOC_TYPES = ["KR", "BQ", "ZK", "OK", "HC", "QY", "IN", "FS", "BY", "QM", "SV"] as const;
type DocType = (typeof DOC_TYPES)[number];
export const isDocType = (x: string): x is DocType => (DOC_TYPES as readonly string[]).includes(x);

/**
 * Partiya yon paneli (prototip `BatchPanel`): holat, yaroqlilik (qolgan kun, oʻtgan ulush chizigʻi), taqsimot (mavjud / band / yopiq),
 * tafsilotlar, kirim hujjati, harakatlar (qoldiq bilan), pastda — zonaga koʻchirish, hisobdan chiqarish, YB ga qaytarish.
 */
export function BatchPanel({ batchId, zoneId, onClose }: { batchId: number; zoneId: number; onClose: () => void }) {
  const t = useTranslations("stock");
  const card = useQuery({
    queryKey: ["stock", "batch", batchId, zoneId],
    queryFn: () => unwrap(api.GET("/api/stock/batch", { params: { query: { batchId, zoneId } } })),
  });
  const b = card.data;
  const state = b ? batchState(b) : "open";
  const S = STATE[state];
  return (
    <Drawer
      open
      onClose={onClose}
      kind={t("ov.bp.kind")}
      title={b?.productName ?? "…"}
      subtitle={b?.batchNumber}
      status={
        b ? (
          <Badge tone={S.tone} icon={S.icon}>
            {t(`ov.bp.st.${state}`)}
          </Badge>
        ) : null
      }
      actions={
        b ? (
          <div className="flex w-full flex-wrap gap-5">
            <ActionLink href="/zone-transfers" icon={ArrowLeftRight} label={t("ov.bp.move")} />
            <ActionLink href="/write-offs" icon={PackageMinus} label={t("ov.bp.writeOff")} />
            {b.zoneType === "QUARANTINE" && b.receiptId ? (
              <ActionLink
                href={`/supplier-returns?receipt=${b.receiptId}&receiptNo=${encodeURIComponent(b.receiptNumber ?? "")}`}
                icon={RotateCcw}
                label={t("ov.bp.supReturn")}
              />
            ) : null}
          </div>
        ) : undefined
      }
    >
      {card.isPending ? (
        <div className="flex justify-center p-8">
          <Spinner />
        </div>
      ) : card.error || !b ? (
        <ErrorState onRetry={() => card.refetch()} />
      ) : (
        <BatchBody b={b} />
      )}
    </Drawer>
  );
}

function ActionLink({ href, icon: I, label }: { href: string; icon: LucideIcon; label: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-primary hover:underline">
      <I size={14} strokeWidth={1.5} aria-hidden />
      {label}
    </Link>
  );
}

function BatchBody({ b }: { b: BatchCard }) {
  const t = useTranslations("stock");
  const [now] = useState(() => Date.now());
  const left = daysLeft(b.expiryDate, now);
  const life = lifeUsed(b.producedOn, b.expiryDate, now);
  const lifeColor = left < 0 || left <= 30 ? "bg-danger" : left <= 90 || life > 85 ? "bg-warning" : "bg-success";
  const expTone = left < 0 || left <= 30 ? "danger" : left <= 90 ? "warning" : "neutral";
  const segs = [
    { key: "avail" as const, qty: b.available, color: "bg-primary" },
    { key: "reserved" as const, qty: b.reserved, color: "bg-border" },
    { key: "closed" as const, qty: b.closed, color: "bg-warning-bg" },
  ].filter((s) => s.qty > 0);
  const split = `${t("ov.bp.total")} ${formatQuantity(b.qty)} = ${segs
    .map((s) => `${t(`ov.bp.${s.key}`)} ${formatQuantity(s.qty)}`)
    .join(" + ")}`;
  const info: [string, string, boolean?][] = [
    [t("ov.bp.branch"), b.branch],
    [t("ov.bp.wh"), b.warehouse],
    [t("ov.bp.zone"), b.zone],
    [t("ov.bp.mfg"), b.producedOn ? day(b.producedOn) : "—"],
    [t("ov.bp.exp"), day(b.expiryDate)],
    ...(b.cost != null ? ([[t("ov.bp.cost"), `${formatMoney(b.cost)} ${t("ov.k.som")}`]] as [string, string][]) : []),
    [t("ov.bp.doc"), b.receiptNumber ?? t("ov.opening"), true],
    [t("ov.bp.supplier"), b.supplier ?? "—"],
    ...(b.marked ? ([[t("ov.bp.marking"), t("ov.bp.markingYes")]] as [string, string][]) : []),
    ...(b.bonus ? ([[t("ov.bp.bonus"), t("ov.bp.bonusYes")]] as [string, string][]) : []),
  ];
  return (
    <div className="flex flex-col gap-5 text-[13px]">
      <section className="flex flex-col gap-2.5">
        <span className="text-caption font-medium text-text-secondary">{t("ov.bp.expiry")}</span>
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-[24px] leading-[30px] font-semibold tracking-tight">{day(b.expiryDate)}</span>
          <Badge tone={expTone}>{left < 0 ? t("ov.bp.expired") : t("ov.daysLeft", { days: left })}</Badge>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-background">
          <div className={cn("h-full rounded-full", lifeColor)} style={{ width: `${life}%` }} />
        </div>
        <div className="flex justify-between text-caption text-text-secondary">
          <span>
            {t("ov.bp.mfg")}: {b.producedOn ? day(b.producedOn) : "—"}
          </span>
          <span>{t("ov.bp.lifeUsed", { n: life })}</span>
        </div>
      </section>

      <section className="flex flex-col gap-2.5">
        <span className="text-caption font-medium text-text-secondary">{t("ov.bp.split")}</span>
        <span className="text-body font-medium">{split}</span>
        <div className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-background">
          {segs.map((s) => (
            <div key={s.key} className={s.color} style={{ width: `${b.qty ? (s.qty / b.qty) * 100 : 0}%` }} title={t(`ov.bp.${s.key}`)} />
          ))}
        </div>
        <div className="flex flex-wrap gap-4 text-caption text-text-secondary">
          {segs.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5">
              <span className={cn("size-2 rounded-sm", s.color)} />
              {t(`ov.bp.${s.key}`)}: {formatQuantity(s.qty)}
            </span>
          ))}
        </div>
      </section>

      <section className="flex flex-col">
        <span className="pb-2 text-body font-semibold">{t("ov.bp.details")}</span>
        <dl className="grid grid-cols-[minmax(0,160px)_minmax(0,1fr)] gap-x-3">
          {info.map(([label, value, mono]) => (
            <div key={label} className="contents">
              <dt className="border-b border-border py-2 text-text-secondary">{label}</dt>
              <dd className={cn("border-b border-border py-2", mono && "font-mono text-mono")}>{value}</dd>
            </div>
          ))}
        </dl>
        {b.receiptId ? (
          <Link
            href={`/receipts/${b.receiptId}`}
            className="mt-2 inline-flex items-center gap-1.5 self-start font-medium text-primary hover:underline"
          >
            <FileText size={14} strokeWidth={1.5} aria-hidden />
            {t("ov.bp.openDoc")} <span className="font-mono text-mono">{b.receiptNumber}</span>
          </Link>
        ) : null}
      </section>

      <section className="flex flex-col">
        <span className="pb-2 text-body font-semibold">{t("ov.bp.moves")}</span>
        {b.moves.length === 0 ? <p className="text-text-secondary">{t("ov.bp.noMoves")}</p> : null}
        {b.moves.map((m, i) => {
          const href = moveHref(m.docType, m.docId);
          const type = isDocType(m.docType) ? t(`ov.bp.doc_${m.docType}`) : m.docType;
          return (
            <div
              key={`${m.docType}-${m.docId}-${i}`}
              className="grid min-h-10 grid-cols-[96px_minmax(0,1fr)_80px_70px] items-center gap-2 border-b border-border"
            >
              <span className="text-text-secondary">{formatDate(new Date(m.occurredAt))}</span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate">{type}</span>
                {href ? (
                  <Link href={href} className="font-mono text-mono text-text-secondary hover:text-primary hover:underline">
                    {m.docNumber}
                  </Link>
                ) : (
                  <span className="font-mono text-mono text-text-secondary">{m.docNumber}</span>
                )}
              </span>
              <span className={cn("tabular text-right font-medium", m.qty > 0 ? "text-success" : "text-warning")}>
                {m.qty > 0 ? "+" : "−"}
                {formatQuantity(Math.abs(m.qty))}
              </span>
              <span className="tabular text-right text-text-secondary">{formatQuantity(m.balance)}</span>
            </div>
          );
        })}
      </section>
    </div>
  );
}
