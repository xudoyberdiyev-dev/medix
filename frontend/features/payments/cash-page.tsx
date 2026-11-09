"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ArrowLeftRight, Banknote, Landmark, LockKeyhole, Plus, UserRound } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";
import { EmptyState, ErrorState, ForbiddenState, Skeleton } from "@/components/ui/system-states";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { api, unwrap } from "@/lib/api/client";
import { formatMoney, formatQuantity } from "@/lib/format";
import { CASH_APPROVE, CASH_CLOSE, CASH_IO, opsFilterFromParams, usableAccount } from "@/features/cash/api";
import { ClosesTab, OpsTab, PendingOps, StatementTab, TransfersTab } from "@/features/cash/cash-sections";
import { BankReconTab } from "@/features/cash/bank-recon";
import { AccountDialog } from "@/features/cash/account-dialog";
import { CashierDialog } from "@/features/cash/cashier-dialog";
import { CloseDrawer } from "@/features/cash/close-drawer";
import { CashOpDialog, TransferDialog } from "@/features/cash/op-dialogs";
import { useBranchStore } from "@/lib/stores/branch";
import { AccountCard, DriverCashSection } from "@/features/cash/cash-list";
import { sumMoney } from "@/features/cash/list-model";
import { useBranchList } from "@/features/organization/api";
import { PAYMENT_MT, useAccounts } from "./api";

/**
 * Pul → Kassa (SPEC 5.4, 5.5): hisoblar qoldigʻi (faqat hujjatlardan), KO/BO (kirim/chiqim, moddalar bilan; katta chiqim — tasdiq),
 * IO (hisoblar orasida), koʻchirma, kunni yopish va «Haydovchidagi pul» — Kassir sanab qabul qiladi → MT.
 */
export function CashPage() {
  const t = useTranslations("cash.page");
  const me = useMe();
  const branches = useBranchList();
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
  const canAddAccount = can(me.data, "settings.view");
  const all = accounts.data ?? [];
  // Kassir faqat oʻz kassasida (backend ham tekshiradi): amallar uchun faqat ishlatish mumkin boʻlgan hisoblar
  const usable = all.filter((a) => usableAccount(a, all, me.data?.id, supervisor));
  const kassas = usable.filter((a) => a.kind === "CASH" && a.active);
  const [selected, setSelected] = useState<number | null>(null);
  const params = useSearchParams();
  // Xarajatlar hisobotidan: ?tab=ops&expenseItemId=… — KO/BO roʻyxati shu modda va davr bilan
  const [opsFilter, setOpsFilter] = useState(() => opsFilterFromParams(params));
  const [tab, setTab] = useState(() => (params.get("tab") === "ops" ? "ops" : "statement"));
  const [dialog, setDialog] = useState<"op" | "io" | "close" | "cashiers" | "account" | null>(null);
  const canIo = can(me.data, CASH_IO);
  const canClose = can(me.data, CASH_CLOSE);
  const canBank = can(me.data, "bank.view");
  const accountList = all;
  const current = selected ?? kassas[0]?.id ?? accountList[0]?.id ?? null;
  const actionDefault = current != null && usable.some((a) => a.id === current) ? current : (usable[0]?.id ?? null);

  if (me.data && !allowed) return <ForbiddenState description={t("forbidden")} />;
  if (me.data && branchId == null)
    return (
      <>
        <h1 className="mb-4 text-page-title">{t("title")}</h1>
        <Card>
          <EmptyState icon={Banknote} title={t("noBranch.title")} description={t("noBranch.description")} />
        </Card>
      </>
    );

  const cashCount = accountList.length;
  const total = sumMoney(accountList.map((a) => a.balance));
  const branchName = branches.data?.find((b) => b.id === branchId)?.name ?? "";
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="flex items-baseline gap-2 text-page-title">
            {t("title")}
            {accounts.data ? <span className="text-body tabular-nums text-text-secondary">{formatQuantity(cashCount)}</span> : null}
          </h1>
          {accounts.data ? <p className="text-table text-text-secondary">{t("list.sub", { s: formatMoney(total) })}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canAddAccount && branchId != null ? (
            <Button variant="secondary" icon={Landmark} onClick={() => setDialog("account")}>
              {t("addAccount")}
            </Button>
          ) : null}
          {canAssign && accountList.some((a) => a.kind === "CASH") ? (
            <Button variant="secondary" icon={UserRound} onClick={() => setDialog("cashiers")}>
              {t("cashiers")}
            </Button>
          ) : null}
          {canClose && kassas.length > 0 ? (
            <Button variant="secondary" icon={LockKeyhole} onClick={() => setDialog("close")}>
              {t("closeDay")}
            </Button>
          ) : null}
          {canIo ? (
            <>
              <Button variant="secondary" icon={ArrowLeftRight} disabled={usable.length < 2} onClick={() => setDialog("io")}>
                {t("transfer")}
              </Button>
              <Button icon={Plus} disabled={usable.length === 0} onClick={() => setDialog("op")}>
                {t("op")}
              </Button>
            </>
          ) : null}
        </div>
      </div>
      {accounts.error ? (
        <ErrorState onRetry={() => accounts.refetch()} />
      ) : accounts.isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : accountList.length === 0 ? (
        <Card>
          <EmptyState icon={Banknote} title={t("list.emptyTitle")} description={t("list.emptyDescription")} />
        </Card>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
          {accountList.map((a) => (
            <AccountCard key={a.id} account={a} branchName={branchName} selected={a.id === current} onOpen={() => setSelected(a.id)} />
          ))}
        </div>
      )}
      {canAccept ? (
        <DriverCashSection
          list={cash.data}
          error={cash.isError}
          onRetry={() => void cash.refetch()}
          kassas={kassas}
          canAccept={canAccept}
        />
      ) : null}
      {branchId != null ? <PendingOps branchId={branchId} /> : null}
      {branchId != null ? (
        <>
          <Tabs
            aria-label={t("tabs.label")}
            value={tab}
            onChange={setTab}
            items={[
              { key: "statement", label: t("tabs.statement") },
              { key: "ops", label: t("tabs.ops") },
              { key: "io", label: t("tabs.io") },
              { key: "closes", label: t("tabs.closes") },
              ...(canBank ? [{ key: "bank", label: t("tabs.bank") }] : []),
            ]}
          />
          <div>
            {tab === "statement" ? (
              <StatementTab accountId={current} />
            ) : tab === "ops" ? (
              <OpsTab branchId={branchId} filter={opsFilter} onClearFilter={() => setOpsFilter(null)} />
            ) : tab === "io" ? (
              <TransfersTab branchId={branchId} />
            ) : tab === "bank" && canBank ? (
              <BankReconTab key={branchId} accounts={accountList} canEdit={canIo || can(me.data, "payments.noncash")} />
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
          ) : dialog === "account" ? (
            <AccountDialog branchId={branchId} onClose={() => setDialog(null)} />
          ) : dialog === "cashiers" ? (
            <CashierDialog branchId={branchId} accounts={accountList} onClose={() => setDialog(null)} />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
