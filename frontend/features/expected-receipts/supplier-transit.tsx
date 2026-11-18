"use client";

import { ArrowUpRight, PackageSearch } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { ErrorState } from "@/components/ui/system-states";
import { canAny } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { formatQuantity } from "@/lib/format";
import { KK_VIEW_KEYS, useInTransit, type InTransitRow } from "./api";
import { kkDay } from "./kk-list-page";

/** Mahsulot yonida: «Yoʻlda: 500 (kutilmoqda 21.11)» — sotuvga olinmaydi (O15). */
export function InTransitNote({ row }: { row: InTransitRow | undefined }) {
  const t = useTranslations("expectedReceipts.transit");
  if (!row || row.qty <= 0) return null;
  return (
    <Badge tone="info" icon={PackageSearch}>
      {row.nearestDate
        ? t("noteDate", { n: formatQuantity(row.qty), date: kkDay(row.nearestDate) })
        : t("note", { n: formatQuantity(row.qty) })}
    </Badge>
  );
}

/** Qoldiqlar → «Yoʻlda»: yetkazib beruvchidan kutilayotgan tovar (KK Yoʻlda / Qisman). */
export function SupplierTransit({ branchId }: { branchId: number | null }) {
  const t = useTranslations("expectedReceipts.transit");
  const me = useMe();
  const allowed = canAny(me.data, KK_VIEW_KEYS);
  const list = useInTransit(null, allowed, branchId);
  if (!allowed) return null;
  if (list.isPending)
    return (
      <div className="flex justify-center rounded-card border border-border bg-surface p-8">
        <Spinner />
      </div>
    );
  if (list.error) return <ErrorState error={list.error} onRetry={() => list.refetch()} />;
  const rows = list.data ?? [];
  return (
    <section className="overflow-x-auto rounded-card border border-border bg-surface" aria-label={t("title")}>
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <PackageSearch size={16} strokeWidth={1.5} className="text-info" aria-hidden />
        <span className="text-body font-semibold">{t("title")}</span>
        <span className="text-text-secondary">{rows.length}</span>
        <span className="flex-1" />
        <span className="text-caption text-text-secondary">{t("desc")}</span>
      </div>
      <table className="w-full min-w-[720px] text-[13px] leading-[18px]">
        <thead>
          <tr className="h-9 bg-table-header text-left text-caption font-medium text-text-secondary">
            <th className="px-4">{t("product")}</th>
            <th className="px-3 text-right">{t("qty")}</th>
            <th className="px-3">{t("docs")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.productId} className="border-t border-border align-top">
              <td className="px-4 py-2">
                <span className="flex flex-col">
                  <span className="font-medium">{r.productName}</span>
                  <span className="font-mono text-caption text-text-secondary">{r.productCode}</span>
                </span>
              </td>
              <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatQuantity(r.qty)}</td>
              <td className="px-3 py-2">
                <ul className="flex flex-col gap-1">
                  {r.docs.map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/expected-receipts/${d.id}`}
                        className="inline-flex items-center gap-1 font-mono text-[12.5px] text-primary hover:underline"
                      >
                        {d.number}
                        <ArrowUpRight size={14} strokeWidth={1.5} aria-hidden />
                      </Link>
                      <span className="text-text-secondary">
                        {d.supplier} · {formatQuantity(d.remainingQty)} · {kkDay(d.expectedDate)}
                      </span>
                      {d.late ? <Badge tone="danger">{t("late")}</Badge> : null}
                    </li>
                  ))}
                </ul>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 ? <div className="px-4 py-8 text-center text-text-secondary">{t("none")}</div> : null}
    </section>
  );
}
