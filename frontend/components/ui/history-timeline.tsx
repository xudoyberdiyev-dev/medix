"use client";

import { History } from "lucide-react";
import { useTranslations } from "next-intl";
import { groupByDay } from "@/lib/history";
import { formatTime } from "@/lib/format";
import { EmptyState, ErrorState, Skeleton } from "./system-states";

export interface HistoryEvent {
  at: string;
  employee?: string;
  action: string;
  reason?: string;
}

/** Hujjat «Tarix» yorligʻi (prototip `HistoryTimeline`): kunlar boʻyicha, vaqt · amal · kim — sabab. */
export function HistoryTimeline({
  query,
  label,
}: {
  query: { data?: HistoryEvent[]; error: unknown; refetch: () => unknown };
  label: (action: string) => string;
}) {
  const t = useTranslations("ui.history");
  if (query.error) return <ErrorState onRetry={() => void query.refetch()} />;
  if (!query.data) return <Skeleton className="h-40 w-full" />;
  if (query.data.length === 0) return <EmptyState icon={History} title={t("empty")} description={t("emptyHint")} />;
  return (
    <div className="flex flex-col gap-4 rounded-card border border-border bg-surface p-4">
      {groupByDay(query.data).map((g) => (
        <section key={g.day} className="flex flex-col gap-2">
          <h3 className="text-caption font-medium text-text-secondary">{g.day}</h3>
          <ol className="flex flex-col gap-2 border-l border-border pl-4">
            {g.items.map((e, i) => (
              <li key={`${e.at}-${i}`} className="flex flex-wrap items-baseline gap-x-2 text-body">
                <span className="font-mono text-caption text-text-secondary tabular-nums">{formatTime(new Date(e.at))}</span>
                <span className="font-medium">{label(e.action)}</span>
                {e.employee ? <span className="text-text-secondary">· {e.employee}</span> : null}
                {e.reason ? <span className="text-text-secondary">— {e.reason}</span> : null}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
