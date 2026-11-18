"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { canAny } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { formatQuantity } from "@/lib/format";
import { KK_VIEW_KEYS, useExpectedReceipts } from "./api";
import { KkLateBadge, kkDay } from "./kk-list-page";

/** Bosh sahifa: «Kutilayotgan kirimlar» — yoʻldagi KK (bugun kutilayotgan va kechikkan birinchi). Ruxsatsiz — koʻrinmaydi. */
export function KkHomeCard({ branchId }: { branchId: number | null }) {
  const t = useTranslations("expectedReceipts.home");
  const me = useMe();
  const allowed = canAny(me.data, KK_VIEW_KEYS);
  const list = useExpectedReceipts({ branchId, status: null, open: true, late: false, page: 1 }, allowed);
  if (!allowed || !list.data || list.data.total === 0) return null;
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tashkent" });
  const items = [...list.data.items].sort(
    (a, b) => Number(b.late) - Number(a.late) || (a.expectedDate ?? "9999").localeCompare(b.expectedDate ?? "9999"),
  );
  const late = items.filter((d) => d.late).length;
  const dueToday = items.filter((d) => d.expectedDate === today).length;
  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-card border border-border bg-surface">
      <header className="flex items-center justify-between gap-3 px-4 pt-4 pb-3">
        <h2 className="text-subtitle">{t("title")}</h2>
        <Link href="/expected-receipts?status=IN_TRANSIT" className="inline-flex items-center gap-1 text-body text-link hover:underline">
          {t("all")} <ArrowRight size={14} strokeWidth={1.5} aria-hidden />
        </Link>
      </header>
      <ul className="flex flex-col px-4 pb-3">
        {items.slice(0, 5).map((d) => (
          <li key={d.id} className="flex items-center justify-between gap-3 border-t border-border py-2 text-body">
            <span className="flex min-w-0 flex-col">
              <Link href={`/expected-receipts/${d.id}`} className="font-mono text-primary hover:underline">
                {d.number}
              </Link>
              <span className="truncate text-caption text-text-secondary">{d.supplier}</span>
            </span>
            <span className="flex items-center gap-2 text-text-secondary">
              {kkDay(d.expectedDate)}
              {d.late ? <KkLateBadge /> : null}
            </span>
          </li>
        ))}
      </ul>
      <p className="border-t border-border px-4 py-3 text-caption text-text-secondary">
        {t("footer", { open: formatQuantity(list.data.total), today: dueToday, late })}
      </p>
    </section>
  );
}
