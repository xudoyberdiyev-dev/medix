"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, CircleCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/system-states";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";

type SystemStatus = components["schemas"]["SystemErrorStatus"];

/** Sinf nomining oxirgi qismi: `java.lang.IllegalStateException` → `IllegalStateException`. */
export function shortException(name: string): string {
  return name.slice(name.lastIndexOf(".") + 1);
}

/** P4: Sozlamalar → Xavfsizlik → «Tizim holati» (faqat settings.security). */
export function SystemStatusSection() {
  const t = useTranslations("settings.sys");
  const q = useQuery({
    queryKey: ["settings", "system-status"],
    queryFn: () => unwrap(api.GET("/api/settings/system-status")),
    refetchInterval: 60_000,
  });
  return (
    <div className="flex flex-col gap-3 border-t border-border px-6 py-4">
      <div>
        <h3 className="flex items-center gap-2 text-[15px] font-semibold">
          <Activity size={16} strokeWidth={1.5} aria-hidden />
          {t("title")}
        </h3>
        <p className="mt-1 text-[13px] leading-[18px] text-text-secondary">{t("sub")}</p>
      </div>
      {q.error ? (
        <ErrorState description={t("failed")} onRetry={() => q.refetch()} />
      ) : !q.data ? (
        <Skeleton className="h-28 w-full" />
      ) : (
        <StatusBody t={t} s={q.data} />
      )}
    </div>
  );
}

function StatusBody({ t, s }: { t: ReturnType<typeof useTranslations<"settings.sys">>; s: SystemStatus }) {
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label={t("day")} value={String(s.last24h)} danger={s.last24h > 0} />
        <Stat label={t("week")} value={String(s.last7d)} danger={s.last7d > 0} />
        <Stat label={t("started")} value={formatDateTime(new Date(s.startedAt))} />
      </div>
      {s.last7d === 0 ? (
        <EmptyState icon={CircleCheck} title={t("okTitle")} description={t("okText")} />
      ) : (
        <>
          {s.top24h.length > 0 ? (
            <div>
              <div className="mb-1.5 text-[12px] font-medium text-text-secondary">{t("top")}</div>
              <ul className="flex flex-col gap-1 text-[13px]">
                {s.top24h.map((g) => (
                  <li key={`${g.exception}|${g.path}`} className="flex gap-2">
                    <span className="w-10 shrink-0 text-right font-medium tabular-nums text-danger">{g.count}×</span>
                    <span className="font-mono">{shortException(g.exception)}</span>
                    <span className="truncate text-text-secondary">{g.path}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[640px] text-[13px]">
              <caption className="sr-only">{t("recent")}</caption>
              <thead className="bg-table-header text-left text-[12px] text-text-secondary">
                <tr>
                  <th className="px-3 py-2 font-medium">{t("when")}</th>
                  <th className="px-3 py-2 font-medium">{t("where")}</th>
                  <th className="px-3 py-2 font-medium">{t("what")}</th>
                </tr>
              </thead>
              <tbody>
                {s.recent.map((r, i) => (
                  <tr key={i} className="border-t border-border align-top">
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">{formatDateTime(new Date(r.occurredAt))}</td>
                    <td className="px-3 py-2 font-mono text-[12.5px]">
                      {r.method} {r.path}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-mono text-[12.5px]">{shortException(r.exception)}</div>
                      {r.message ? <div className="line-clamp-2 text-text-secondary">{r.message}</div> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <div className="text-[12px] text-text-secondary">{label}</div>
      <div className={cn("mt-0.5 text-[18px] font-semibold tabular-nums", danger && "text-danger")}>{value}</div>
    </div>
  );
}
