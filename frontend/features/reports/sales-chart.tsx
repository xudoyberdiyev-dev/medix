"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { axisLabel } from "@/features/home/director-view";
import { formatIsoDate } from "@/features/counterparties/api";
import { formatMoney } from "@/lib/format";
import { barShare, type DayBar, maxAbsCents } from "./sales-kpis";

/** «Sof savdo — davr boʻyicha» (prototip Reports): kunlar ustunlari, manfiy — qizil, ustiga olib borilsa — kun, summa, hujjatlar. */
export function SalesDayChart({ bars }: { bars: DayBar[] }) {
  const t = useTranslations("reports.sales.chart");
  const [open, setOpen] = useState(true);
  const [tip, setTip] = useState<number | null>(null);
  const W = 600;
  const H = 160;
  const n = Math.max(1, bars.length);
  const bw = W / n;
  const barW = Math.min(bw * 0.6, 40);
  const max = maxAbsCents(bars.map((b) => b.net));
  const cur = tip == null ? null : bars[tip];
  return (
    <section className="mb-4 rounded-card border border-border bg-surface p-4 print:break-inside-avoid" aria-labelledby="sales-chart-title">
      <div className="flex items-center justify-between gap-3">
        <h2 id="sales-chart-title" className="text-body font-semibold">
          {t("title")}
        </h2>
        <button type="button" className="text-caption text-primary hover:underline print:hidden" onClick={() => setOpen((o) => !o)}>
          {open ? t("hide") : t("show")}
        </button>
      </div>
      {open ? (
        <div className="relative mt-3 min-w-0">
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-40 w-full" role="img" aria-label={t("title")}>
            {[0, 40, 80, 120].map((y) => (
              <line key={y} x1={0} x2={W} y1={y + 0.5} y2={y + 0.5} className="stroke-border" strokeWidth={1} />
            ))}
            <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} className="stroke-border" strokeWidth={1} />
            {bars.map((b, i) => {
              const s = barShare(b.net, max);
              const bh = s > 0 ? Math.max(2, s * (H - 10)) : 0;
              const neg = b.net.trim().startsWith("-");
              return (
                <rect
                  key={b.date}
                  x={i * bw + (bw - barW) / 2}
                  y={H - bh}
                  width={barW}
                  height={bh}
                  rx={2}
                  className={neg ? "fill-danger" : tip === i ? "fill-primary-button" : "fill-primary"}
                  onMouseEnter={() => setTip(i)}
                  onMouseLeave={() => setTip(null)}
                />
              );
            })}
          </svg>
          <div className="mt-1 flex text-caption text-text-secondary">
            {bars.map((b, i) => (
              <span key={b.date} className="flex-1 text-center tabular-nums">
                {axisLabel(b.date, i, bars.length)}
              </span>
            ))}
          </div>
          {cur ? (
            <div
              className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-control border border-border bg-surface px-3 py-2 text-caption whitespace-nowrap"
              style={{ left: `${((tip! + 0.5) / n) * 100}%` }}
            >
              <div className="text-text-secondary">{formatIsoDate(cur.date)}</div>
              <div className="font-semibold tabular-nums">
                {formatMoney(cur.net)} {t("soum")}
              </div>
              <div className="text-text-secondary">{t("docsN", { n: cur.orders })}</div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
