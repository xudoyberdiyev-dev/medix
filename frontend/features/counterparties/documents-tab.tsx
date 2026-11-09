"use client";

import { ArrowUpRight, FileX } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState, ForbiddenState, Skeleton } from "@/components/ui/system-states";
import { formatMoney } from "@/lib/format";
import { formatIsoDate, type CounterpartyRole } from "./api";
import { useCounterpartyDocuments } from "./api";
import { docHref, docState, sectionHref, type DocRow, type DocSection } from "./documents-model";

const todayIso = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(new Date());
const GRID = "grid grid-cols-[160px_110px_140px_minmax(160px,1fr)_150px] items-center";

/** Kartochka hujjat yorligʻi (prototip CounterpartyCard gList): sarlavha + «Boʻlimga oʻtish», Raqam / Sana / Filial / Holat / Summa. */
export function DocumentsTab({
  id,
  role,
  section,
  allowed,
}: {
  id: number;
  role: CounterpartyRole;
  section: DocSection;
  allowed: boolean;
}) {
  const t = useTranslations("counterparties.docs");
  const customers = role === "CUSTOMER";
  const q = useCounterpartyDocuments(id, role, section, allowed);
  if (!allowed) return <ForbiddenState description={t("forbidden")} />;
  const today = todayIso();
  const state = (r: DocRow) => {
    const s = docState(r, today);
    switch (s.kind) {
      case "paid":
        return { tone: s.tone, label: t("paid") };
      case "late":
        return { tone: s.tone, label: t("late", { n: String(s.days), sum: formatMoney(s.open) }) };
      case "due":
        return {
          tone: s.tone,
          label: s.due ? t("due", { date: formatIsoDate(s.due), sum: formatMoney(s.open) }) : t("dueNone", { sum: formatMoney(s.open) }),
        };
      case "status": {
        // Bazadagi holat kodi — tarjima boʻlmasa kodning oʻzi
        const key = `st.${s.status}` as "st.DRAFT";
        return { tone: s.tone, label: t.has(key) ? t(key) : s.status };
      }
    }
  };
  return (
    <section className="overflow-x-auto rounded-card border border-border bg-surface">
      <div className="flex min-w-[640px] items-center justify-between gap-3 border-b border-border px-4 py-3">
        <span className="flex items-baseline gap-3">
          <span className="text-[14px] font-semibold">{t(`title.${section}`)}</span>
          {q.data && q.data.total > q.data.items.length ? (
            <span className="text-caption text-text-secondary">
              {t("lastN", { n: String(q.data.items.length), total: String(q.data.total) })}
            </span>
          ) : null}
        </span>
        <Link
          href={sectionHref(section, customers)}
          className="flex items-center gap-1 text-[12.5px] font-medium text-primary-button hover:underline"
        >
          {t("goPage")}
          <ArrowUpRight size={14} strokeWidth={1.5} aria-hidden />
        </Link>
      </div>
      <div className="min-w-[640px]">
        <div className={`${GRID} h-[38px] border-b border-border bg-table-header text-[12px] font-medium text-text-secondary`}>
          <span className="px-4">{t("no")}</span>
          <span className="px-3">{t("date")}</span>
          <span className="px-3">{t("branch")}</span>
          <span className="px-3">{t("status")}</span>
          <span className="pr-4 pl-3 text-right">{t("sum")}</span>
        </div>
        {q.isPending ? (
          <div className="flex flex-col gap-2 p-4">
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </div>
        ) : q.error ? (
          <ErrorState onRetry={() => q.refetch()} />
        ) : q.data.items.length === 0 ? (
          <EmptyState icon={FileX} title={t("emptyTitle")} description={t("emptyDescription")} />
        ) : (
          q.data.items.map((r) => {
            const href = docHref(section, customers, r);
            const st = state(r);
            const no = r.extraNumber && section === "SALES" ? `${r.number} · ${r.extraNumber}` : r.number;
            return (
              <div key={r.id} className={`${GRID} min-h-11 border-b border-border text-[13px] last:border-b-0`}>
                <span className="px-4">
                  {href ? (
                    <Link href={href} className="font-mono text-[12.5px] text-primary-button hover:underline">
                      {no}
                    </Link>
                  ) : (
                    <span className="font-mono text-[12.5px]">{no}</span>
                  )}
                </span>
                <span className="px-3 text-text-secondary">{formatIsoDate(r.date)}</span>
                <span className="truncate px-3 text-text-secondary">{r.branchName}</span>
                <span className="flex min-w-0 px-3">
                  <Badge tone={st.tone} className="truncate">
                    {st.label}
                  </Badge>
                </span>
                <span className="pr-4 pl-3 text-right font-medium tabular-nums">{formatMoney(r.amount)}</span>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
