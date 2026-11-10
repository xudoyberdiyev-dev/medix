"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Factory, FolderTree, Globe, type LucideIcon, MapPin, Ruler, Truck, Wallet } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ErrorState, Skeleton } from "@/components/ui/system-states";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { formatDateTime } from "@/lib/format";

export type OverviewCard = components["schemas"]["OverviewCard"];
export type OverviewKind = OverviewCard["kind"];

/** Karta → roʻyxat (`/dictionaries?tab=`) va ikonka (prototip Lookups). */
export const OVERVIEW_TABS: Record<OverviewKind, { tab: string; icon: LucideIcon }> = {
  MANUFACTURER: { tab: "manufacturer", icon: Factory },
  CATEGORY: { tab: "category", icon: FolderTree },
  COUNTRY: { tab: "country", icon: Globe },
  UNIT: { tab: "unit", icon: Ruler },
  REGION: { tab: "region", icon: MapPin },
  FLEET: { tab: "vehicles", icon: Truck },
  EXPENSE_ITEM: { tab: "expense-items", icon: Wallet },
};

export function overviewHref(kind: OverviewKind): string {
  return `/dictionaries?tab=${OVERVIEW_TABS[kind].tab}`;
}

/** «Boshqa maʼlumotnomalar» — kartalar toʻri: soni va oxirgi oʻzgarish; karta → roʻyxat. */
export function DictionariesOverview() {
  const t = useTranslations("dictionaries.overview");
  const q = useQuery({ queryKey: ["dictionaries", "overview"], queryFn: () => unwrap(api.GET("/api/dictionaries-overview")) });
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-page-title">{t("title")}</h1>
        <p className="mt-1 text-caption text-text-secondary">{t("subtitle")}</p>
      </div>
      {q.isError ? (
        <ErrorState onRetry={() => void q.refetch()} />
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
          {q.data
            ? q.data.map((c) => {
                const Icon = OVERVIEW_TABS[c.kind].icon;
                return (
                  <li key={c.kind}>
                    <Link
                      href={overviewHref(c.kind)}
                      className="flex h-full min-w-0 flex-col gap-3 rounded-[10px] border border-border bg-surface p-4 shadow-sm hover:border-text-secondary hover:shadow-md"
                    >
                      <span className="flex w-full items-center justify-between gap-2">
                        <span className="flex size-9 items-center justify-center rounded-[9px] bg-primary-soft text-primary">
                          <Icon size={18} strokeWidth={1.5} aria-hidden />
                        </span>
                        <ChevronRight size={16} strokeWidth={1.5} aria-hidden className="text-text-secondary" />
                      </span>
                      <span className="flex flex-col gap-0.5">
                        <span className="text-subtitle">{t(`kinds.${c.kind}`)}</span>
                        <span className="text-caption text-text-secondary">
                          {c.kind === "FLEET"
                            ? t("fleetCount", { drivers: c.drivers ?? 0, vehicles: c.count })
                            : t("count", { n: c.count })}
                        </span>
                      </span>
                      <span className="text-caption text-text-secondary">
                        {c.lastChangedAt ? t("last", { d: formatDateTime(new Date(c.lastChangedAt)) }) : t("lastNone")}
                      </span>
                    </Link>
                  </li>
                );
              })
            : Array.from({ length: 7 }, (_, i) => (
                <li key={i}>
                  <Skeleton className="h-[132px] rounded-[10px]" />
                </li>
              ))}
        </ul>
      )}
    </div>
  );
}
