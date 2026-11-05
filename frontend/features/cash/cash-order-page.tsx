"use client";

import { useQuery } from "@tanstack/react-query";
import { ReceiptText, TriangleAlert } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { EmptyState, ErrorState, ForbiddenState, Skeleton } from "@/components/ui/system-states";
import { formatIsoDate } from "@/features/counterparties/api";
import { parseIds } from "@/features/orders/pick-sheet";
import { PrintShell as Shell, Signatures } from "@/features/orders/print-shell";
import { useBranchList } from "@/features/organization/api";
import { api, ApiError, unwrap } from "@/lib/api/client";
import { formatMoney } from "@/lib/format";
import { moneyInWords } from "@/lib/words";

const STATUS_MARK: Record<string, string | null> = {
  POSTED: null,
  PENDING: "TASDIQLANMAGAN — pul harakati hali yozilmagan",
  REJECTED: "RAD ETILGAN",
  CANCELLED: "BEKOR QILINGAN",
};

/** Kassa kirim / chiqim orderi (/print/cash-op?id=…): KO/BO kartochkasidan, summa soʻz bilan, imzo joylari. */
export function CashOrderPage() {
  const params = useSearchParams();
  const id = parseIds(params.get("id"))[0] ?? null;
  const op = useQuery({
    queryKey: ["cash-ops", "one", id],
    queryFn: () => unwrap(api.GET("/api/cash-ops/{id}", { params: { path: { id: id ?? 0 } } })),
    enabled: id !== null,
  });
  const branches = useBranchList();

  if (id === null) {
    return (
      <Shell>
        <EmptyState icon={ReceiptText} title="Operatsiya tanlanmagan" description="Kassa → KO/BO jadvalidagi «Chop etish»ni bosing." />
      </Shell>
    );
  }
  const error = op.error ?? branches.error;
  if (error) {
    return (
      <Shell>
        {error instanceof ApiError && error.isForbidden ? (
          <ForbiddenState description="Kassa orderini koʻrish uchun kassa ruxsati kerak." />
        ) : (
          <ErrorState onRetry={() => void Promise.all([op.refetch(), branches.refetch()])} />
        )}
      </Shell>
    );
  }
  if (!op.data || !branches.data) {
    return (
      <Shell>
        <Skeleton className="h-64 w-full" />
      </Shell>
    );
  }

  const o = op.data;
  const org = branches.data.find((b) => b.id === o.branchId);
  const incoming = o.direction === "IN";
  const prefix = o.accountKind === "CASH" ? "Kassa" : o.accountKind === "BANK" ? "Bank" : "Terminal";
  const mark = STATUS_MARK[o.status] ?? null;

  return (
    <Shell ready>
      <header className="flex items-start justify-between gap-4 border-b border-text-primary pb-3">
        <div className="text-caption">
          <div className="font-medium">{org?.legalName ?? "—"}</div>
          <div>STIR: {org?.tin ?? "—"}</div>
        </div>
        <div className="text-right">
          <h1 className="text-page-title">
            {prefix} {incoming ? "kirim" : "chiqim"} orderi
          </h1>
          <div>
            <span className="font-mono">{o.number}</span> · {formatIsoDate(o.opDate)}
          </div>
        </div>
      </header>
      {mark ? (
        <p className="mt-3 flex items-center justify-center gap-2 border border-danger p-2 font-medium text-danger">
          <TriangleAlert size={16} strokeWidth={1.5} aria-hidden />
          {mark}
        </p>
      ) : null}

      <dl className="mt-4 grid grid-cols-[12rem_1fr] gap-x-4 gap-y-2">
        <dt className="text-text-secondary">{incoming ? "Kimdan qabul qilindi" : "Kimga berildi"}</dt>
        <dd>{o.party ?? "—"}</dd>
        <dt className="text-text-secondary">Asos (modda)</dt>
        <dd>{o.item}</dd>
        <dt className="text-text-secondary">Hisob</dt>
        <dd>{o.account}</dd>
        <dt className="text-text-secondary">Summa</dt>
        <dd className="text-subtitle tabular-nums">{formatMoney(o.amount)} soʻm</dd>
        <dt className="text-text-secondary">Soʻz bilan</dt>
        <dd className="border-b border-border pb-1 first-letter:uppercase">{moneyInWords(o.amount)}</dd>
        {o.note ? (
          <>
            <dt className="text-text-secondary">Izoh</dt>
            <dd>{o.note}</dd>
          </>
        ) : null}
        <dt className="text-text-secondary">Yozdi</dt>
        <dd>{o.createdBy}</dd>
        {o.approvedBy ? (
          <>
            <dt className="text-text-secondary">Tasdiqladi</dt>
            <dd>{o.approvedBy}</dd>
          </>
        ) : null}
      </dl>

      <Signatures roles={["Rahbar", "Bosh buxgalter", "Kassir", incoming ? "Topshirdi" : "Oldi"]} />
    </Shell>
  );
}
