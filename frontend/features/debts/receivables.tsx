"use client";

import { CircleCheck, ClockAlert, Gauge, HandCoins, Wallet, X, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge, type Tone } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import { AGE_KEYS, shareText, statusOf, sumOf, toTiyin, usedPct, type AgeKey, type DebtLike, type DebtStatus } from "./receivables-model";

/** Muddat boʻlaklari ranglari (prototip AGE): kulrang → sariq → toʻq qizil. */
const AGE_COLOR: Record<AgeKey, string> = {
  notDue: "bg-text-disabled",
  d1to30: "bg-warning/60",
  d31to60: "bg-warning",
  d61to90: "bg-danger/80",
  d90plus: "bg-danger",
};

const STATUS: Record<DebtStatus, { tone: Tone; icon: LucideIcon }> = {
  ok: { tone: "success", icon: CircleCheck },
  overdue: { tone: "danger", icon: ClockAlert },
  limit: { tone: "warning", icon: Gauge },
  adv: { tone: "info", icon: Wallet },
};

export function DebtStatusBadge({ row }: { row: DebtLike }) {
  const t = useTranslations("debts.recv");
  const s = statusOf(row);
  return (
    <Badge tone={STATUS[s].tone} icon={STATUS[s].icon}>
      {t(`status.${s}`)}
    </Badge>
  );
}

export function UsedBar({ row }: { row: DebtLike }) {
  const p = usedPct(row);
  if (p === null) return <span className="text-text-secondary">—</span>;
  return (
    <div className="flex items-center gap-2">
      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-border">
        <span
          className={cn("block h-full rounded-full", p > 100 ? "bg-danger" : p > 80 ? "bg-warning" : "bg-primary")}
          style={{ width: `${Math.min(100, p)}%` }}
        />
      </span>
      <span className={cn("tabular-nums", p > 100 && "text-danger")}>{`${String(p).replace(".", ",")}%`}</span>
    </div>
  );
}

/** KPI kartalari (Jami qarz + 4 muddat boʻlagi) va «Muddat taqsimoti» chizigʻi — bosilsa jadval filtrlanadi. */
export function ReceivablesSummary(props: {
  rows: DebtLike[];
  ages: AgeKey[];
  onAges: (a: AgeKey[]) => void;
  onAll: () => void;
  allActive: boolean;
}) {
  const t = useTranslations("debts.recv");
  const { rows, ages } = props;
  const debtors = rows.filter((r) => toTiyin(r.buckets.debt) > 0).length;
  const total = sumOf(rows, (r) => r.buckets.debt);
  const sums = Object.fromEntries(AGE_KEYS.map((k) => [k, sumOf(rows, (r) => r.buckets[k])])) as Record<AgeKey, string>;
  const ageTotal = sumOf(AGE_KEYS as unknown as AgeKey[], (k) => sums[k]);
  const toggle = (k: AgeKey) => props.onAges(ages.length === 1 && ages[0] === k ? [] : [k]);
  const RANGE: Record<Exclude<AgeKey, "notDue">, string> = { d1to30: "1–30", d31to60: "31–60", d61to90: "61–90", d90plus: "90+" };

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KpiCard
          icon={HandCoins}
          iconClass="bg-primary-soft text-primary"
          label={t("kTotal")}
          value={formatMoney(total)}
          note={t("nParties", { n: debtors })}
          active={props.allActive}
          onClick={props.onAll}
        />
        {(["d1to30", "d31to60", "d61to90", "d90plus"] as const).map((k) => {
          const heavy = k === "d61to90" || k === "d90plus";
          const v = sums[k];
          const on = ages.length === 1 && ages[0] === k;
          return (
            <KpiCard
              key={k}
              icon={ClockAlert}
              iconClass={heavy ? "bg-danger-bg text-danger" : "bg-warning-bg text-warning"}
              label={t("kOverdue", { r: RANGE[k] })}
              value={formatMoney(v)}
              valueClass={toTiyin(v) > 0 ? (heavy ? "text-danger" : "text-warning") : undefined}
              note={t("nParties", { n: rows.filter((r) => toTiyin(r.buckets[k]) > 0).length })}
              active={on}
              onClick={() => toggle(k)}
            />
          );
        })}
      </div>
      <section className="flex min-w-0 flex-col gap-3.5 rounded-card border border-border bg-surface px-5 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <span className="text-body font-semibold">{t("agTitle")}</span>
          <span className="flex items-center gap-3 text-caption text-text-secondary">
            <span>{t("agHint")}</span>
            {ages.length > 0 ? (
              <button
                type="button"
                onClick={() => props.onAges([])}
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                <X size={12} strokeWidth={1.5} aria-hidden />
                {t("clear")}
              </button>
            ) : null}
          </span>
        </div>
        <div className="flex h-4 gap-0.5 overflow-hidden rounded-[5px] bg-border">
          {AGE_KEYS.map((k) => {
            const v = toTiyin(sums[k]);
            if (v <= 0) return null;
            const tip = `${t(`age.${k}`)}: ${formatMoney(sums[k])} · ${shareText(sums[k], ageTotal)}`;
            return (
              <button
                key={k}
                type="button"
                title={tip}
                aria-label={tip}
                onClick={() => toggle(k)}
                style={{ flexGrow: v, minWidth: 4 }}
                className={cn(
                  "h-full transition-opacity hover:opacity-100",
                  AGE_COLOR[k],
                  ages.length && !ages.includes(k) ? "opacity-35" : "opacity-100",
                )}
              />
            );
          })}
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(132px,1fr))] gap-x-4 gap-y-2.5">
          {AGE_KEYS.map((k) => {
            const v = toTiyin(sums[k]);
            return (
              <button
                key={k}
                type="button"
                onClick={() => toggle(k)}
                className={cn(
                  "-mx-2 -my-1.5 flex min-w-0 flex-col gap-0.5 rounded-[6px] px-2 py-1.5 text-left hover:bg-table-header",
                  ages.includes(k) && "bg-primary-soft",
                )}
              >
                <span className="flex items-center gap-1.5 whitespace-nowrap text-caption text-text-secondary">
                  <span className={cn("size-2.5 flex-none rounded-[2px]", AGE_COLOR[k])} />
                  {t(`age.${k}`)}
                </span>
                <span
                  className={cn(
                    "truncate text-body font-semibold tabular-nums",
                    v > 0 && (k === "d61to90" || k === "d90plus") ? "text-danger" : v > 0 ? "text-text-primary" : "text-text-secondary",
                  )}
                >
                  {formatMoney(sums[k])}
                </span>
                <span className="text-caption text-text-secondary">{shareText(sums[k], ageTotal)}</span>
              </button>
            );
          })}
        </div>
      </section>
    </>
  );
}

function KpiCard(props: {
  icon: LucideIcon;
  iconClass: string;
  label: string;
  value: string;
  valueClass?: string;
  note: string;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = props.icon;
  return (
    <button
      type="button"
      aria-pressed={props.active}
      onClick={props.onClick}
      className={cn(
        "flex min-w-0 flex-col gap-1.5 rounded-card border bg-surface px-4 py-3.5 text-left transition-colors hover:border-text-secondary",
        props.active ? "border-primary" : "border-border",
      )}
    >
      <span className="flex items-center gap-2 text-caption font-medium text-text-secondary">
        <span className={cn("flex size-6 flex-none items-center justify-center rounded-[6px]", props.iconClass)}>
          <Icon size={14} strokeWidth={1.5} aria-hidden />
        </span>
        {props.label}
      </span>
      <span
        className={cn(
          "max-w-full truncate text-[clamp(18px,1.6vw,24px)] leading-[30px] font-semibold tracking-[-0.02em] tabular-nums",
          props.valueClass,
        )}
      >
        {props.value}
      </span>
      <span className="max-w-full truncate text-caption text-text-secondary">{props.note}</span>
    </button>
  );
}
