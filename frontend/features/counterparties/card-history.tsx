"use client";

import { useTranslations } from "next-intl";
import { HistoryTimeline } from "@/components/ui/history-timeline";
import { useCounterpartyHistory, type CounterpartyRole } from "./api";

/** Kartochka «Tarix» (prototip HistoryTimeline): kunlar boʻyicha — vaqt · amal · kim — sabab. */
export function CardHistory({ id, role }: { id: number; role: CounterpartyRole }) {
  const t = useTranslations("counterparties.docs.hist");
  const q = useCounterpartyHistory(id, role);
  const label = (action: string) => {
    const key = action.replace(/^counterparty\./, "") as "create";
    return t.has(key) ? t(key) : action;
  };
  const data = q.data?.map((e) => ({ at: e.at, employee: e.employee ?? undefined, action: e.action, reason: e.reason ?? undefined }));
  return <HistoryTimeline query={{ data, error: q.error, refetch: q.refetch }} label={label} />;
}
