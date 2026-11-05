"use client";

import { useQueries } from "@tanstack/react-query";
import { ClipboardList, Printer } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, ForbiddenState, Skeleton } from "@/components/ui/system-states";
import { useMe } from "@/features/auth/session";
import { api, ApiError, unwrap } from "@/lib/api/client";
import { formatDateTime, formatQuantity } from "@/lib/format";
import { day } from "./orders-page";
import { buildPickSheet, parseIds } from "./pick-sheet";

/** Terish varagʻi (/print/picking?ids=1,2): bir necha buyurtma bitta varaqda, zona boʻyicha. */
export function PickSheetPage() {
  const params = useSearchParams();
  const ids = parseIds(params.get("ids"));
  const me = useMe();
  const results = useQueries({
    queries: ids.map((id) => ({
      queryKey: ["orders", "one", id],
      queryFn: () => unwrap(api.GET("/api/orders/{id}", { params: { path: { id } } })),
    })),
  });
  const failed = results.find((r) => r.error);
  const ready = ids.length > 0 && results.every((r) => r.data);
  const printed = useRef(false);

  useEffect(() => {
    if (ready && !printed.current) {
      printed.current = true;
      window.print();
    }
  }, [ready]);

  if (ids.length === 0) {
    return (
      <Shell>
        <EmptyState
          icon={ClipboardList}
          title="Buyurtma tanlanmagan"
          description="Yigʻish sahifasida buyurtmalarni belgilab, «Terish varagʻi»ni bosing."
        />
      </Shell>
    );
  }
  if (failed) {
    if (failed.error instanceof ApiError && failed.error.isForbidden) {
      return (
        <Shell>
          <ForbiddenState description="Terish varagʻi faqat yigʻuvchi va ombor xodimlari uchun." />
        </Shell>
      );
    }
    return (
      <Shell>
        <ErrorState onRetry={() => results.forEach((r) => void r.refetch())} />
      </Shell>
    );
  }
  if (!ready) {
    return (
      <Shell>
        <Skeleton className="h-64 w-full" />
      </Shell>
    );
  }

  const orders = results.flatMap((r) => (r.data ? [r.data] : []));
  const sheet = buildPickSheet(orders);
  const warehouses = [...new Set(orders.map((o) => o.warehouse))].join(", ");

  return (
    <Shell>
      <div className="mb-4 flex items-center justify-end gap-2 print:hidden">
        <Button icon={Printer} onClick={() => window.print()}>
          Chop etish
        </Button>
      </div>
      <header className="flex items-start justify-between gap-4 border-b border-text-primary pb-3">
        <div>
          <div className="text-caption text-text-secondary">MEDIX</div>
          <h1 className="text-page-title">Terish varagʻi</h1>
          <div className="text-text-secondary">Ombor: {warehouses}</div>
        </div>
        <div className="text-right text-caption text-text-secondary">
          <div>Chop etildi: {formatDateTime(new Date())}</div>
          <div>Kim: {me.data?.fullName ?? "—"}</div>
          <div className="tabular-nums">
            {formatQuantity(sheet.orders.length)} buyurtma · {formatQuantity(sheet.rows.length)} qator · {formatQuantity(sheet.totalQty)}{" "}
            dona
          </div>
        </div>
      </header>

      <section className="mt-4">
        <h2 className="mb-2 text-subtitle">Buyurtmalar</h2>
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-border text-caption text-text-secondary">
              <th className="py-1 pr-2 font-medium">Raqam</th>
              <th className="py-1 pr-2 font-medium">Mijoz</th>
              <th className="py-1 pr-2 text-right font-medium">Qator</th>
              <th className="py-1 pr-2 text-right font-medium">Dona</th>
              <th className="py-1 font-medium">Izoh</th>
            </tr>
          </thead>
          <tbody>
            {sheet.orders.map((o) => (
              <tr key={o.id} className="border-b border-border">
                <td className="py-1 pr-2 font-mono">{o.number}</td>
                <td className="py-1 pr-2">{o.customer}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{formatQuantity(o.lines)}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{formatQuantity(o.qty)}</td>
                <td className="py-1">{o.marked ? "Markirovka" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-subtitle">Terish (zona boʻyicha)</h2>
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-text-primary text-caption text-text-secondary">
              <th className="w-8 py-1 pr-2 font-medium">✓</th>
              <th className="py-1 pr-2 font-medium">Zona</th>
              <th className="py-1 pr-2 font-medium">Mahsulot</th>
              <th className="py-1 pr-2 font-medium">Partiya</th>
              <th className="py-1 pr-2 font-medium">Muddati</th>
              <th className="py-1 pr-2 text-right font-medium">Dona</th>
              <th className="py-1 font-medium">Buyurtmalarga</th>
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((r) => (
              <tr key={`${r.zone}|${r.productCode}|${r.batch}`} className="break-inside-avoid border-b border-border align-top">
                <td className="py-1.5 pr-2">
                  <span className="inline-block size-4 border border-text-primary" aria-hidden />
                </td>
                <td className="py-1.5 pr-2 font-mono">{r.zone || "—"}</td>
                <td className="py-1.5 pr-2">
                  <span className="font-mono text-text-secondary">{r.productCode}</span> {r.productName}
                </td>
                <td className="py-1.5 pr-2 font-mono">{r.batch || "—"}</td>
                <td className="py-1.5 pr-2 tabular-nums">{r.expiryDate ? day(r.expiryDate) : "—"}</td>
                <td className="py-1.5 pr-2 text-right text-subtitle tabular-nums">{formatQuantity(r.qty)}</td>
                <td className="py-1.5 text-caption">
                  {r.orders.map((o) => `${o.number.slice(-6)} — ${formatQuantity(o.qty)}`).join("; ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {sheet.rows.some((r) => r.zone === "") ? (
          <p className="mt-2 text-caption text-text-secondary">«—» — zahira hali taqsimlanmagan: partiyani Ombor mudiridan soʻrang.</p>
        ) : null}
      </section>

      <footer className="mt-10 grid grid-cols-2 gap-10 text-caption">
        <div className="border-t border-text-primary pt-1">Yigʻuvchi (F.I.Sh., imzo)</div>
        <div className="border-t border-text-primary pt-1">Tekshirdi (F.I.Sh., imzo)</div>
      </footer>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return <main className="mx-auto max-w-[210mm] p-6 print:max-w-none print:p-0">{children}</main>;
}
