"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Banknote, HandCoins, Landmark, LockKeyhole, Plus, Truck, UserRound } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Tabs } from "@/components/ui/tabs";
import { EmptyState, ErrorState, ForbiddenState, Skeleton } from "@/components/ui/system-states";
import { toast } from "@/components/ui/toast";
import { can } from "@/features/auth/can";
import { ensureCsrf, useMe } from "@/features/auth/session";
import { describeError } from "@/features/setup/form-error";
import { api, unwrap } from "@/lib/api/client";
import { formatDateTime, formatMoney } from "@/lib/format";
import { CASH_APPROVE, CASH_CLOSE, CASH_IO, usableAccount } from "@/features/cash/api";
import { ClosesTab, OpsTab, PendingOps, StatementTab, TransfersTab } from "@/features/cash/cash-sections";
import { CashierDialog } from "@/features/cash/cashier-dialog";
import { CloseDrawer } from "@/features/cash/close-drawer";
import { CashOpDialog, TransferDialog } from "@/features/cash/op-dialogs";
import { useBranchStore } from "@/lib/stores/branch";
import { ACCOUNT_KIND, PAYMENT_MT, useAccounts, type DriverCash } from "./api";

/**
 * Pul → Kassa (SPEC 5.4, 5.5): hisoblar qoldigʻi (faqat hujjatlardan), KO/BO (kirim/chiqim, moddalar bilan; katta chiqim — tasdiq),
 * IO (hisoblar orasida), koʻchirma, kunni yopish va «Haydovchidagi pul» — Kassir sanab qabul qiladi → MT.
 */
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
  const supervisor = can(me.data, CASH_APPROVE);
  const canAssign = supervisor || can(me.data, "settings.view");
  const all = accounts.data ?? [];
  // Kassir faqat oʻz kassasida (backend ham tekshiradi): amallar uchun faqat ishlatish mumkin boʻlgan hisoblar
  const usable = all.filter((a) => usableAccount(a, all, me.data?.id, supervisor));
  const kassas = usable.filter((a) => a.kind === "CASH" && a.active);
  const [target, setTarget] = useState<string | null>(null);
  const kassa = target ?? (kassas[0] ? String(kassas[0].id) : null);
  const [pending, setPending] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [tab, setTab] = useState("statement");
  const [dialog, setDialog] = useState<"op" | "io" | "close" | "cashiers" | null>(null);
  const canIo = can(me.data, CASH_IO);
  const canClose = can(me.data, CASH_CLOSE);
  const accountList = all;
  const current = selected ?? kassas[0]?.id ?? accountList[0]?.id ?? null;
  const actionDefault = current != null && usable.some((a) => a.id === current) ? current : (usable[0]?.id ?? null);
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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-page-title">Kassa</h1>
        <div className="flex flex-wrap gap-3">
          {canAssign && accountList.some((a) => a.kind === "CASH") ? (
            <Button variant="secondary" icon={UserRound} onClick={() => setDialog("cashiers")}>
              Kassirlar
            </Button>
          ) : null}
          {canClose && kassas.length > 0 ? (
            <Button variant="secondary" icon={LockKeyhole} onClick={() => setDialog("close")}>
              Kunni yopish
            </Button>
          ) : null}
          {canIo ? (
            <>
              <Button variant="secondary" icon={ArrowLeftRight} disabled={usable.length < 2} onClick={() => setDialog("io")}>
                Oʻtkazma
              </Button>
              <Button icon={Plus} disabled={usable.length === 0} onClick={() => setDialog("op")}>
                Kirim / chiqim
              </Button>
            </>
          ) : null}
        </div>
      </div>
      {accounts.error ? (
        <ErrorState onRetry={() => accounts.refetch()} />
      ) : accounts.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          {accountList.map((a) => (
            <button
              key={a.id}
              type="button"
              aria-pressed={a.id === current}
              onClick={() => setSelected(a.id)}
              className={`rounded-lg text-left outline-offset-2 ${a.id === current ? "ring-2 ring-primary" : ""}`}
            >
              <Card>
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
                {a.kind === "CASH" ? (
                  <div className="mt-1 flex items-center gap-1 text-caption text-text-secondary">
                    <UserRound size={14} strokeWidth={1.5} aria-hidden />
                    {a.cashierName ? `Kassir: ${a.cashierName}` : "Kassir biriktirilmagan"}
                  </div>
                ) : null}
                <div className="mt-2 font-mono text-subtitle tabular-nums">{formatMoney(a.balance)} soʻm</div>
              </Card>
            </button>
          ))}
        </div>
      )}
      {branchId != null ? <PendingOps branchId={branchId} /> : null}
      {canAccept ? (
        <Card className="mb-6">
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
      {branchId != null ? (
        <>
          <Tabs
            aria-label="Kassa boʻlimlari"
            value={tab}
            onChange={setTab}
            items={[
              { key: "statement", label: "Koʻchirma" },
              { key: "ops", label: "Kirim / chiqim (KO, BO)" },
              { key: "io", label: "Oʻtkazmalar (IO)" },
              { key: "closes", label: "Yopilgan kunlar" },
            ]}
          />
          <div className="mt-4">
            {tab === "statement" ? (
              <StatementTab accountId={current} />
            ) : tab === "ops" ? (
              <OpsTab branchId={branchId} />
            ) : tab === "io" ? (
              <TransfersTab branchId={branchId} />
            ) : (
              <ClosesTab branchId={branchId} />
            )}
          </div>
          {dialog === "op" ? (
            <CashOpDialog branchId={branchId} accounts={usable} defaultAccount={actionDefault} onClose={() => setDialog(null)} />
          ) : dialog === "io" ? (
            <TransferDialog branchId={branchId} accounts={usable} defaultFrom={actionDefault} onClose={() => setDialog(null)} />
          ) : dialog === "close" ? (
            <CloseDrawer accounts={usable} defaultAccount={actionDefault} onClose={() => setDialog(null)} />
          ) : dialog === "cashiers" ? (
            <CashierDialog branchId={branchId} accounts={accountList} onClose={() => setDialog(null)} />
          ) : null}
        </>
      ) : null}
    </>
  );
}
