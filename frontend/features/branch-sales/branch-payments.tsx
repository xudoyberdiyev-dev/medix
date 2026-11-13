"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { can } from "@/features/auth/can";
import { ensureCsrf, useMe } from "@/features/auth/session";
import { refreshMoney, ReasonDialog } from "@/features/cash/op-dialogs";
import { ACCOUNT_KIND, useAccounts } from "@/features/payments/api";
import { describeError } from "@/features/setup/form-error";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { formatDate, formatMoney } from "@/lib/format";
import type { BranchBalance } from "./api";

export type BranchPayment = components["schemas"]["BranchPayment"];
type Me = components["schemas"]["MeResponse"];

export const CASH_IO = "cash.io";
export const CASH_CANCEL = "cash.cancel";

/** To'lovni qarzdor filial xodimi (cash.io) yoki barcha filiallar egasi qiladi. */
export function canPayFor(me: Pick<Me, "permissions" | "allBranches" | "branchId"> | undefined, debtorBranchId: number): boolean {
  if (!me || !can(me, CASH_IO)) return false;
  return me.allBranches || me.branchId === debtorBranchId;
}

export function useBranchPayments(enabled: boolean) {
  return useQuery({
    queryKey: ["branch-payments"],
    queryFn: () => unwrap(api.GET("/api/branch-payments")),
    enabled,
  });
}

function usePayeeAccounts(payer: number, payee: number) {
  return useQuery({
    queryKey: ["branch-payments", "payee-accounts", payer, payee],
    queryFn: () =>
      unwrap(api.GET("/api/branch-payments/payee-accounts", { params: { query: { payerBranchId: payer, payeeBranchId: payee } } })),
  });
}

async function refreshAll(qc: ReturnType<typeof useQueryClient>) {
  await refreshMoney(qc);
  await qc.invalidateQueries({ queryKey: ["branch-payments"] });
  await qc.invalidateQueries({ queryKey: ["branch-sales", "balances"] });
}

/** Filialga to'lov: qarzdor hisobidan → kreditor hisobiga; qarz kamayadi (summa qarzdan oshmaydi — server tekshiradi). */
export function BranchPayDialog({ balance, onClose }: { balance: BranchBalance; onClose: () => void }) {
  const t = useTranslations("branchSales.payments");
  const qc = useQueryClient();
  const own = useAccounts(balance.debtor.id);
  const payee = usePayeeAccounts(balance.debtor.id, balance.creditor.id);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [amount, setAmount] = useState(balance.amount);
  const [note, setNote] = useState("");
  const [local, setLocal] = useState<string | null>(null);
  const pay = useMutation({
    mutationFn: async () => {
      await ensureCsrf();
      return unwrap(
        api.POST("/api/branch-payments", {
          body: {
            payerBranchId: balance.debtor.id,
            payeeBranchId: balance.creditor.id,
            fromAccountId: Number(from),
            toAccountId: Number(to),
            amount,
            note: note.trim() || undefined,
          },
        }),
      );
    },
    onSuccess: async (r) => {
      await refreshAll(qc);
      toast({
        tone: "success",
        title: t("paid"),
        description: t("paidDescription", { number: r.number, from: r.payerBranch, to: r.payeeBranch, amount: formatMoney(r.amount) }),
      });
      onClose();
    },
  });
  const source = own.data?.find((a) => String(a.id) === from);
  const err = describeError(pay.error);
  return (
    <Modal
      open
      onClose={onClose}
      title={t("dialogTitle", { name: balance.creditor.name })}
      primaryAction={{
        label: t("pay"),
        loading: pay.isPending,
        onClick: () => {
          setLocal(null);
          if (!from || !to) return setLocal(t("pickAccounts"));
          if (!amount.trim()) return setLocal(t("enterAmount"));
          pay.mutate();
        },
      }}
    >
      <div className="flex flex-col gap-4">
        {err.message ? <Alert tone="danger" title={err.message} /> : null}
        {local ? <Alert tone="warning" title={local} /> : null}
        <p className="text-body text-text-secondary">
          {t.rich("debtLine", {
            name: balance.debtor.name,
            amount: formatMoney(balance.amount),
            money: (chunks) => <span className="font-mono tabular-nums">{chunks}</span>,
          })}
        </p>
        <Select
          loading={own.isLoading}
          label={t("fromAccount")}
          value={from}
          onChange={setFrom}
          options={(own.data ?? [])
            .filter((a) => a.active)
            .map((a) => ({ value: String(a.id), label: a.name, sub: `${ACCOUNT_KIND[a.kind]} · ${a.code}` }))}
        />
        <Select
          loading={payee.isLoading}
          label={t("toAccount", { name: balance.creditor.name })}
          value={to}
          onChange={setTo}
          options={(payee.data ?? []).map((a) => ({ value: String(a.id), label: a.name, sub: ACCOUNT_KIND[a.kind] }))}
        />
        <TextField label={t("amount")} variant="amount" value={amount} onChange={setAmount} required suffix={t("currency")} />
        <TextField label={t("note")} value={note} onChange={setNote} maxLength={500} />
        {source ? (
          <div className="text-caption text-text-secondary">
            {t.rich("balance", {
              name: source.name,
              amount: formatMoney(source.balance),
              money: (chunks) => <span className="font-mono tabular-nums">{chunks}</span>,
            })}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

/** Oxirgi filiallararo to'lovlar; to'lovchi filial (cash.cancel) bekor qila oladi. */
export function BranchPaymentsList({ enabled }: { enabled: boolean }) {
  const t = useTranslations("branchSales.payments");
  const me = useMe();
  const qc = useQueryClient();
  const list = useBranchPayments(enabled);
  const [cancel, setCancel] = useState<BranchPayment | null>(null);
  const rows = (list.data ?? []).slice(0, 10);
  if (rows.length === 0) return null;
  return (
    <div className="mt-3 border-t border-border pt-3">
      <h3 className="mb-2 text-body font-medium">{t("list")}</h3>
      <ul className="flex flex-col gap-1 text-body">
        {rows.map((p) => {
          const cancelled = p.status === "CANCELLED";
          const canCancel = !cancelled && can(me.data, CASH_CANCEL) && (me.data?.allBranches || me.data?.branchId === p.payerBranchId);
          return (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-1">
                <span className="font-mono">{p.number}</span> · {formatDate(new Date(`${p.paymentDate}T00:00:00+05:00`))} · {p.payerBranch}
                <ArrowRight size={14} strokeWidth={1.5} aria-label={t("arrow")} className="text-text-secondary" />
                {p.payeeBranch}
                {cancelled ? <Badge status="cancelled" /> : null}
              </span>
              <span className="flex items-center gap-2">
                <span className={`tabular-nums ${cancelled ? "line-through text-text-secondary" : ""}`}>{formatMoney(p.amount)}</span>
                {canCancel ? (
                  <Button variant="tertiary" size="sm" icon={Undo2} onClick={() => setCancel(p)}>
                    {t("cancel")}
                  </Button>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
      {cancel ? (
        <ReasonDialog
          title={t("cancelTitle", { number: cancel.number })}
          action={t("cancel")}
          onClose={() => setCancel(null)}
          onSubmit={async (reason) => {
            await ensureCsrf();
            await unwrap(api.POST("/api/branch-payments/{id}/cancel", { params: { path: { id: cancel.id } }, body: { reason } }));
            await refreshAll(qc);
            toast({ tone: "success", title: t("cancelled"), description: cancel.number });
          }}
        />
      ) : null}
    </div>
  );
}
