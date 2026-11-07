"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/system-states";
import { api, unwrap } from "@/lib/api/client";
import { formatQuantity } from "@/lib/format";

/** «Bugungi natijam» (Yigʻuvchi / Markirovkachi): yakunlangan buyurtmalar, qator, dona yoki kodlar, vaqtida / kechikkan, oʻrtacha vaqt. */
export function MyToday({ kind }: { kind: "pickers" | "markers" }) {
  const t = useTranslations("orders");
  const today = useQuery({
    queryKey: ["reports", kind, "mine"],
    queryFn: () => unwrap(kind === "pickers" ? api.GET("/api/reports/pickers/mine") : api.GET("/api/reports/markers/mine")),
    refetchInterval: 60_000,
  });
  if (today.error) return null;
  const r = today.data;
  const items: [string, string, boolean][] = r
    ? [
        [t("myToday.orders"), formatQuantity(r.orders), false],
        [t("myToday.lines"), formatQuantity(r.lines), false],
        kind === "pickers"
          ? [t("myToday.units"), formatQuantity(r.units), false]
          : [t("myToday.codes"), formatQuantity(r.codes ?? 0), false],
        [t("myToday.onTime"), formatQuantity(r.onTime), false],
        [t("myToday.late"), formatQuantity(r.late), r.late > 0],
        [t("myToday.avg"), t("myToday.avgValue", { minutes: formatQuantity(r.avgMinutes) }), false],
      ]
    : [];
  return (
    <div className="mb-6 rounded-card border border-border bg-surface p-3" aria-label={t("myToday.title")}>
      <h2 className="mb-2 text-subtitle">{t("myToday.title")}</h2>
      {r ? (
        <dl className="grid grid-cols-3 gap-x-4 gap-y-2">
          {items.map(([k, v, danger]) => (
            <div key={k}>
              <dt className="text-caption text-text-secondary">{k}</dt>
              <dd className={`tabular-nums ${danger ? "text-danger" : ""}`}>{v}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <Skeleton className="h-12 w-full" />
      )}
    </div>
  );
}
