"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, HandCoins, Landmark, Truck } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { EmptyState, ErrorState, ForbiddenState, Skeleton } from "@/components/ui/system-states";
import { toast } from "@/components/ui/toast";
import { can } from "@/features/auth/can";
import { ensureCsrf, useMe } from "@/features/auth/session";
import { describeError } from "@/features/setup/form-error";
import { api, unwrap } from "@/lib/api/client";
import { formatDateTime, formatMoney } from "@/lib/format";
import { useBranchStore } from "@/lib/stores/branch";
import { ACCOUNT_KIND, PAYMENT_MT, useAccounts, type DriverCash } from "./api";

/** Pul → Kassa: hisoblar qoldigʻi (faqat hujjatlardan) va «Haydovchidagi pul» — Kassir sanab qabul qiladi → MT (SPEC 5.4, 5.5). */
export function CashPage() {
  const me = useMe();
  const qc = useQueryClient();
  const selectedBranch = useBranchStore((s) => s.branchId);
  const allowed = can(me.data, "cash.view");
  const canAccept = can(me.data, PAYMENT_MT);
  const branchId = me.data?.allBranches ? (selectedBranch ?? null) : (me.data?.branchId ?? null);
  const accounts = useAccounts(allowed ? branchId : null);
  const cash = useQuery({
    queryKey: ["trips", "cash", branchId],
    queryFn: () => unwrap(api.GET("/api/trips/cash", { params: { query: { branchId: branchId ?? undefined } } })),
    enabled: canAccept && branchId != null,
    refetchInterval: 30_000,
  });
  const kassas = (accounts.data ?? []).filter((a) => a.kind === "CASH" && a.active);
  const [target, setTarget] = useState<string | null>(null);
  const kassa = target ?? (kassas[0] ? String(kassas[0].id) : null);
  const [pending, setPending] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);

  if (me.data && !allowed) return <ForbiddenState description="Kassa sahifasi sizning rolingiz uchun yopiq." />;
  if (me.data && branchId == null)
    return (
      <EmptyState icon={Banknote} title="Filialni tanlang" description="Kassa filial boʻyicha yuritiladi — yuqorida filialni tanlang." />
    );

  async function accept(c: DriverCash) {
    if (!kassa) return;
    setPending(c.stopId);
    setError(null);
    try {
      await ensureCsrf();
      const r = await unwrap(
        api.POST("/api/trips/cash/{stopId}/accept", { params: { path: { stopId: c.stopId } }, body: { accountId: Number(kassa) } }),
      );
      toast({ tone: "success", title: "Pul qabul qilindi", description: `${r.payment} · ${formatMoney(c.amount)} soʻm · ${c.customer}` });
      await qc.invalidateQueries({ queryKey: ["trips", "cash"] });
      await qc.invalidateQueries({ queryKey: ["money-accounts"] });
      await qc.invalidateQueries({ queryKey: ["payments"] });
    } catch (e) {
      setError(e);
    } finally {
      setPending(null);
    }
  }

  const err = describeError(error);
  return (
    <>
      <h1 className="mb-4 text-page-title">Kassa</h1>
      {accounts.error ? (
        <ErrorState onRetry={() => accounts.refetch()} />
      ) : accounts.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          {(accounts.data ?? []).map((a) => (
            <Card key={a.id}>
              <div className="flex items-center gap-2 text-caption text-text-secondary">
                {a.kind === "BANK" ? (
                  <Landmark size={16} strokeWidth={1.5} aria-hidden />
                ) : (
                  <Banknote size={16} strokeWidth={1.5} aria-hidden />
                )}
                {ACCOUNT_KIND[a.kind]} · <span className="font-mono">{a.code}</span>
                {a.active ? "" : " · nofaol"}
              </div>
              <div className="mt-1">{a.name}</div>
              <div className="mt-2 font-mono text-subtitle tabular-nums">{formatMoney(a.balance)} soʻm</div>
            </Card>
          ))}
        </div>
      )}
      {canAccept ? (
        <Card>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-subtitle">Haydovchidagi pul</h2>
            <div className="w-64">
              <Select
                label="Qabul qilinadigan kassa"
                value={kassa}
                onChange={setTarget}
                options={kassas.map((a) => ({ value: String(a.id), label: a.name, sub: a.code }))}
              />
            </div>
          </div>
          {err.message ? <Alert tone="danger" title={err.message} className="mb-3" /> : null}
          {cash.error ? (
            <ErrorState onRetry={() => cash.refetch()} />
          ) : cash.isPending ? (
            <Skeleton className="h-20 w-full" />
          ) : (cash.data ?? []).length === 0 ? (
            <EmptyState
              icon={Truck}
              title="Haydovchilarda pul yoʻq"
              description="Naqd toʻlov yetkazilganda summa shu yerda paydo boʻladi."
            />
          ) : (
            <ul className="flex flex-col">
              {(cash.data ?? []).map((c) => (
                <li key={c.stopId} className="flex flex-wrap items-center justify-between gap-3 border-t border-border py-3">
                  <div className="min-w-0">
                    <div>
                      {c.driver} · <span className="font-mono">{c.tripNumber}</span>
                    </div>
                    <div className="text-caption text-text-secondary">
                      {c.customer} · <span className="font-mono">{c.orderNumber}</span> · {formatDateTime(new Date(c.collectedAt))}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono tabular-nums">{formatMoney(c.amount)} soʻm</span>
                    <Button
                      variant="secondary"
                      icon={HandCoins}
                      disabled={!kassa}
                      loading={pending === c.stopId}
                      onClick={() => void accept(c)}
                    >
                      Qabul qildim
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}
    </>
  );
}
