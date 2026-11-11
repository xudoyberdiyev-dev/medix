"use client";

import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { HistoryTimeline } from "@/components/ui/history-timeline";
import { Tabs } from "@/components/ui/tabs";

export type DocEventKind = "create" | "post" | "reject" | "cancel";

export interface DocEvent {
  at: string;
  who: string;
  kind: DocEventKind;
  reason?: string;
}

/** Hujjat holatidan tarix: yaratildi → tasdiqlandi / rad etildi / bekor qilindi (vaqt boʻyicha). */
export function docEvents(d: {
  createdAt: string;
  createdBy: string;
  postedAt?: string | null;
  postedBy?: string | null;
  rejectedAt?: string | null;
  rejectedBy?: string | null;
  rejectReason?: string | null;
  cancelledAt?: string | null;
  cancelledBy?: string | null;
  cancelReason?: string | null;
}): DocEvent[] {
  const out: DocEvent[] = [{ at: d.createdAt, who: d.createdBy, kind: "create" }];
  if (d.postedAt) out.push({ at: d.postedAt, who: d.postedBy ?? "", kind: "post" });
  if (d.rejectedAt) out.push({ at: d.rejectedAt, who: d.rejectedBy ?? "", kind: "reject", reason: d.rejectReason ?? undefined });
  if (d.cancelledAt) out.push({ at: d.cancelledAt, who: d.cancelledBy ?? "", kind: "cancel", reason: d.cancelReason ?? undefined });
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

/** Prototip hujjat sahifasi: «Hujjat» / «Tarix (N)» yorliqlari. */
export function DocTabs({ events, children }: { events: DocEvent[]; children: ReactNode }) {
  const t = useTranslations("ui.docTabs");
  const [tab, setTab] = useState("doc");
  return (
    <>
      <Tabs
        aria-label={t("label")}
        items={[
          { key: "doc", label: t("doc") },
          { key: "hist", label: t("hist"), count: events.length },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "doc" ? (
        children
      ) : (
        <HistoryTimeline
          query={{
            data: [...events].reverse().map((e) => ({ at: e.at, employee: e.who, action: e.kind, reason: e.reason })),
            error: null,
            refetch: () => 0,
          }}
          label={(a) => t(`a.${a as DocEventKind}`)}
        />
      )}
    </>
  );
}
