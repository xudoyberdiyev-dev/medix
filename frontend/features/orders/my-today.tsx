"use client";

import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/system-states";
import { api, unwrap } from "@/lib/api/client";
import { formatQuantity } from "@/lib/format";

/** «Bugungi natijam» (Yigʻuvchi / Markirovkachi): yakunlangan buyurtmalar, qator, dona yoki kodlar, vaqtida / kechikkan, oʻrtacha vaqt. */
export function MyToday({ kind }: { kind: "pickers" | "markers" }) {
  const today = useQuery({
    queryKey: ["reports", kind, "mine"],
    queryFn: () => unwrap(kind === "pickers" ? api.GET("/api/reports/pickers/mine") : api.GET("/api/reports/markers/mine")),
    refetchInterval: 60_000,
  });
  if (today.error) return null;
  const r = today.data;
  const items: [string, string][] = r
    ? [
        ["Buyurtma", formatQuantity(r.orders)],
        ["Qator", formatQuantity(r.lines)],
        kind === "pickers" ? ["Dona", formatQuantity(r.units)] : ["Kodlar", formatQuantity(r.codes ?? 0)],
        ["Vaqtida", formatQuantity(r.onTime)],
        ["Kechikkan", formatQuantity(r.late)],
        ["Oʻrtacha", `${formatQuantity(r.avgMinutes)} daq.`],
      ]
    : [];
  return (
    <div className="mb-6 rounded-card border border-border bg-surface p-3" aria-label="Bugungi natijam">
      <h2 className="mb-2 text-subtitle">Bugungi natijam</h2>
      {r ? (
        <dl className="grid grid-cols-3 gap-x-4 gap-y-2">
          {items.map(([k, v]) => (
            <div key={k}>
              <dt className="text-caption text-text-secondary">{k}</dt>
              <dd className={`tabular-nums ${k === "Kechikkan" && r.late > 0 ? "text-danger" : ""}`}>{v}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <Skeleton className="h-12 w-full" />
      )}
    </div>
  );
}
