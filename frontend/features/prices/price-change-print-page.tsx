"use client";

import { Tags, TriangleAlert } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { EmptyState, ErrorState, ForbiddenState, Skeleton } from "@/components/ui/system-states";
import { formatIsoDate } from "@/features/counterparties/api";
import { parseIds } from "@/features/orders/pick-sheet";
import { PrintShell as Shell, Signatures } from "@/features/orders/print-shell";
import { useBranchList } from "@/features/organization/api";
import { ApiError } from "@/lib/api/client";
import { formatMoney } from "@/lib/format";
import { STATUS_LABELS, usePriceChange } from "./api";

/** NO — narx oʻzgarishi hujjati (/print/price-change?id=…): eski / yangi narx, foiz, katta oʻzgarishlar belgisi. */
export function PriceChangePrintPage() {
  const params = useSearchParams();
  const id = parseIds(params.get("id"))[0] ?? null;
  const doc = usePriceChange(id);
  const branches = useBranchList();

  if (id === null) {
    return (
      <Shell>
        <EmptyState icon={Tags} title="Hujjat tanlanmagan" description="Narxlar → NO hujjatini ochib, «Chop etish»ni bosing." />
      </Shell>
    );
  }
  const error = doc.error ?? branches.error;
  if (error) {
    return (
      <Shell>
        {error instanceof ApiError && error.isForbidden ? (
          <ForbiddenState description="NO hujjatini koʻrish uchun narxlar ruxsati kerak." />
        ) : (
          <ErrorState onRetry={() => void Promise.all([doc.refetch(), branches.refetch()])} />
        )}
      </Shell>
    );
  }
  if (!doc.data || !branches.data) {
    return (
      <Shell>
        <Skeleton className="h-64 w-full" />
      </Shell>
    );
  }

  const d = doc.data;
  const branch = branches.data.find((b) => b.id === d.branchId);
  const lines = [...d.lines].sort(
    (a, b) => a.productName.localeCompare(b.productName, "uz") || a.priceType.localeCompare(b.priceType, "uz"),
  );

  return (
    <Shell ready>
      <header className="flex items-start justify-between gap-4 border-b border-text-primary pb-3">
        <div>
          <div className="text-caption">{branch?.legalName ?? "—"}</div>
          <h1 className="text-page-title">
            Narx oʻzgarishi <span className="font-mono">{d.number}</span>
          </h1>
          <div className="text-text-secondary">
            Kuchga kiradi: {formatIsoDate(d.effectiveFrom)} · Filial: {branch?.name ?? "—"}
          </div>
        </div>
        <div className="text-right text-caption text-text-secondary">
          <div>Holat: {STATUS_LABELS[d.status]}</div>
          <div>Tuzdi: {d.createdBy}</div>
          {d.decidedBy ? <div>Qaror: {d.decidedBy}</div> : null}
        </div>
      </header>

      <table className="mt-4 w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-text-primary text-caption text-text-secondary">
            <th className="py-1 pr-2 font-medium">№</th>
            <th className="py-1 pr-2 font-medium">Mahsulot</th>
            <th className="py-1 pr-2 font-medium">Narx turi</th>
            <th className="py-1 pr-2 text-right font-medium">Eski narx</th>
            <th className="py-1 pr-2 text-right font-medium">Yangi narx</th>
            <th className="py-1 text-right font-medium">Oʻzgarish</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={l.id} className="break-inside-avoid border-b border-border">
              <td className="py-1.5 pr-2 tabular-nums">{i + 1}</td>
              <td className="py-1.5 pr-2">
                <span className="font-mono text-text-secondary">{l.productCode}</span> {l.productName}
              </td>
              <td className="py-1.5 pr-2">{l.priceType}</td>
              <td className="py-1.5 pr-2 text-right whitespace-nowrap tabular-nums">{l.oldPrice ? formatMoney(l.oldPrice) : "—"}</td>
              <td className="py-1.5 pr-2 text-right whitespace-nowrap tabular-nums">{formatMoney(l.newPrice)}</td>
              <td className="py-1.5 text-right whitespace-nowrap tabular-nums">
                {l.bigChange ? (
                  <TriangleAlert
                    size={14}
                    strokeWidth={1.5}
                    className="mr-1 inline align-[-2px] text-warning"
                    aria-label="Katta oʻzgarish"
                  />
                ) : null}
                {l.changePercent ? `${l.changePercent.replace(".", ",")} %` : "yangi"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-caption text-text-secondary">
        Narxlar QQS bilan, soʻmda. {d.bigChanges > 0 ? `Katta oʻzgarishlar: ${d.bigChanges} ta.` : ""}
      </p>
      {d.note ? <p className="mt-2">Izoh: {d.note}</p> : null}

      <Signatures roles={["Tuzdi", "Tasdiqladi"]} />
    </Shell>
  );
}
