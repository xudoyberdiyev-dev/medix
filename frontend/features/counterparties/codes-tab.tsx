"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ScanLine } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Pagination, type PageSize } from "@/components/ui/pagination";
import { EmptyState, ErrorState, ForbiddenState, Skeleton } from "@/components/ui/system-states";
import { TextField } from "@/components/ui/text-field";
import { api, unwrap } from "@/lib/api/client";
import { formatDateTime } from "@/lib/format";

/** O10c: mijoz kartochkasi «Markirovka kodlari» — yetkazilgan, «Mijoz nomiga» buyurtmalar kodlari. */
export function CustomerCodesTab({ id, allowed }: { id: number; allowed: boolean }) {
  const t = useTranslations("counterparties.codes");
  const to = useTranslations("orders");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState<PageSize>(50);
  const codes = useQuery({
    queryKey: ["customer-codes", id, q, page, size],
    queryFn: () =>
      unwrap(
        api.GET("/api/marking/customer-codes", {
          params: { query: { customerId: id, q: q.trim() || undefined, page: page - 1, size } },
        }),
      ),
    placeholderData: keepPreviousData,
    enabled: allowed,
  });
  if (!allowed) return <ForbiddenState />;
  return (
    <section className="rounded-card border border-border bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <span className="text-[14px] font-semibold">{t("title")}</span>
        <div className="w-72">
          <TextField
            label={t("search")}
            variant="search"
            size="sm"
            value={q}
            onChange={(v) => (setQ(v), setPage(1))}
            placeholder={t("searchPlaceholder")}
            className="[&>label]:sr-only"
          />
        </div>
      </div>
      {codes.error ? (
        <ErrorState onRetry={() => codes.refetch()} />
      ) : codes.isPending ? (
        <Skeleton className="m-4 h-32" />
      ) : codes.data.items.length === 0 ? (
        <EmptyState icon={ScanLine} title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[13px]">
              <thead className="bg-table-header text-caption text-text-secondary">
                <tr>
                  <th className="px-3 py-2 font-medium">{t("col.order")}</th>
                  <th className="px-3 py-2 font-medium">{t("col.product")}</th>
                  <th className="px-3 py-2 font-medium">{t("col.code")}</th>
                  <th className="px-3 py-2 font-medium">{t("col.date")}</th>
                </tr>
              </thead>
              <tbody>
                {codes.data.items.map((c) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="px-3 py-2 font-mono">{c.orderNumber}</td>
                    <td className="px-3 py-2">{c.productName}</td>
                    <td className="px-3 py-2 font-mono" title={c.code}>
                      {c.gtin} · {c.serial} · {c.batch} · {to(`kind.${c.kind}`)}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{formatDateTime(new Date(c.scannedAt))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-border px-4 py-2.5">
            <Pagination
              page={page}
              pageSize={size}
              total={codes.data.total}
              onPageChange={setPage}
              onPageSizeChange={(s) => (setSize(s), setPage(1))}
            />
          </div>
        </>
      )}
    </section>
  );
}
