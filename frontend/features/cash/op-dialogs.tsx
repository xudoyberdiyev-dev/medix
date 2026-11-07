"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { ensureCsrf } from "@/features/auth/session";
import { parseUzDate, formatIsoDate, todayTashkent } from "@/features/counterparties/api";
import { useExpenseItems } from "@/features/dictionaries/api";
import type { MoneyAccount } from "@/features/payments/api";
import { describeError } from "@/features/setup/form-error";
import { api, unwrap } from "@/lib/api/client";
import { formatMoney } from "@/lib/format";
import { isOverApprovalLimit } from "./api";

export async function refreshMoney(qc: ReturnType<typeof useQueryClient>) {
  await Promise.all(
    ["money-accounts", "cash-ops", "money-transfers", "cash-close", "payments"].map((k) => qc.invalidateQueries({ queryKey: [k] })),
  );
}

const accountOptions = (accounts: MoneyAccount[], kindLabel: (kind: MoneyAccount["kind"]) => string) =>
  accounts.filter((a) => a.active).map((a) => ({ value: String(a.id), label: a.name, sub: `${kindLabel(a.kind)} · ${a.code}` }));

/** KO / BO: kirim yoki chiqim, modda bilan. Kassadan 2 000 000 soʻmdan katta chiqim tasdiqqa ketadi. */
export function CashOpDialog(props: { branchId: number; accounts: MoneyAccount[]; defaultAccount: number | null; onClose: () => void }) {
  const t = useTranslations("cash.op");
  const tc = useTranslations("cash");
  const tk = useTranslations("payments.accountKind");
  const qc = useQueryClient();
  const items = useExpenseItems();
  const [direction, setDirection] = useState<"IN" | "OUT">("OUT");
  const [account, setAccount] = useState<string | null>(props.defaultAccount != null ? String(props.defaultAccount) : null);
  const [item, setItem] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(formatIsoDate(todayTashkent()));
  const [party, setParty] = useState("");
  const [note, setNote] = useState("");
  const [local, setLocal] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const selected = props.accounts.find((a) => String(a.id) === account);
  const needsApproval = direction === "OUT" && selected?.kind === "CASH" && amount !== "" && isOverApprovalLimit(amount);
  const itemOptions = (items.data ?? [])
    .filter((i) => i.active && i.direction === (direction === "OUT" ? "EXPENSE" : "INCOME"))
    .map((i) => ({ value: String(i.id), label: i.name }));

  async function submit() {
    setLocal(null);
    setError(null);
    if (!account) return setLocal(t("selectAccount"));
    if (!item) return setLocal(t(`selectItem.${direction}`));
    if (!amount) return setLocal(tc("enterAmount"));
    const iso = parseUzDate(date);
    if (iso === null) return setLocal(tc("badDateExample"));
    setPending(true);
    try {
      await ensureCsrf();
      const r = await unwrap(
        api.POST("/api/cash-ops", {
          body: {
            branchId: props.branchId,
            accountId: Number(account),
            direction,
            itemId: Number(item),
            amount,
            opDate: iso,
            party: party.trim() || undefined,
            note: note.trim() || undefined,
          },
        }),
      );
      await refreshMoney(qc);
      toast({
        tone: "success",
        title: r.status === "PENDING" ? t("sentForApproval") : t(`saved.${direction}`),
        description: tc("amountLine", { number: r.number, amount: formatMoney(r.amount) }),
      });
      props.onClose();
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  }

  const err = describeError(error);
  return (
    <Modal
      open
      onClose={props.onClose}
      size="lg"
      title={t(`title.${direction}`)}
      primaryAction={{ label: needsApproval ? t("sendForApproval") : t("submit"), onClick: () => void submit(), loading: pending }}
    >
      <div className="flex flex-col gap-4">
        {err.message ? <Alert tone="danger" title={err.message} /> : null}
        {local ? <Alert tone="warning" title={local} /> : null}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Select
            label={t("direction")}
            value={direction}
            onChange={(v) => {
              setDirection(v === "IN" ? "IN" : "OUT");
              setItem(null);
            }}
            options={[
              { value: "OUT", label: tc("col.out") },
              { value: "IN", label: tc("col.in") },
            ]}
          />
          <Select label={tc("col.account")} value={account} onChange={setAccount} options={accountOptions(props.accounts, tk)} />
          <Select
            label={t(`item.${direction}`)}
            value={item}
            onChange={setItem}
            options={itemOptions}
            placeholder={items.isPending ? tc("loading") : tc("choose")}
          />
          <TextField label={tc("col.amount")} variant="amount" value={amount} onChange={setAmount} required suffix={tc("currency")} />
          <TextField label={tc("col.date")} value={date} onChange={setDate} placeholder="04.10.2026" />
          <TextField label={t(`party.${direction}`)} value={party} onChange={setParty} maxLength={200} />
        </div>
        <TextField label={tc("col.note")} value={note} onChange={setNote} maxLength={500} />
        {needsApproval ? <Alert tone="info" title={t("approvalHint")} /> : null}
        {selected ? (
          <div className="text-caption text-text-secondary">
            {t.rich("balance", {
              name: selected.name,
              amount: formatMoney(selected.balance),
              num: (chunks) => <span className="font-mono tabular-nums">{chunks}</span>,
            })}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

/** IO: bir filial hisoblari orasida (kassa → bank, Terminal → bank, …). Darhol oʻtkaziladi. */
export function TransferDialog(props: { branchId: number; accounts: MoneyAccount[]; defaultFrom: number | null; onClose: () => void }) {
  const t = useTranslations("cash.io");
  const tc = useTranslations("cash");
  const tk = useTranslations("payments.accountKind");
  const qc = useQueryClient();
  const [from, setFrom] = useState<string | null>(props.defaultFrom != null ? String(props.defaultFrom) : null);
  const [to, setTo] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [local, setLocal] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const source = props.accounts.find((a) => String(a.id) === from);

  async function submit() {
    setLocal(null);
    setError(null);
    if (!from || !to) return setLocal(t("selectBoth"));
    if (from === to) return setLocal(t("sameAccount"));
    if (!amount) return setLocal(tc("enterAmount"));
    setPending(true);
    try {
      await ensureCsrf();
      const r = await unwrap(
        api.POST("/api/money-transfers", {
          body: { branchId: props.branchId, fromAccountId: Number(from), toAccountId: Number(to), amount, note: note.trim() || undefined },
        }),
      );
      await refreshMoney(qc);
      toast({
        tone: "success",
        title: t("saved"),
        description: t("savedDescription", { number: r.number, from: r.fromAccount, to: r.toAccount, amount: formatMoney(r.amount) }),
      });
      props.onClose();
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  }

  const err = describeError(error);
  const options = accountOptions(props.accounts, tk);
  return (
    <Modal
      open
      onClose={props.onClose}
      title={t("title")}
      primaryAction={{ label: t("submit"), onClick: () => void submit(), loading: pending }}
    >
      <div className="flex flex-col gap-4">
        {err.message ? <Alert tone="danger" title={err.message} /> : null}
        {local ? <Alert tone="warning" title={local} /> : null}
        <Select label={t("from")} value={from} onChange={setFrom} options={options} />
        <Select label={t("to")} value={to} onChange={setTo} options={options.filter((o) => o.value !== from)} />
        <TextField label={tc("col.amount")} variant="amount" value={amount} onChange={setAmount} required suffix={tc("currency")} />
        <TextField label={tc("col.note")} value={note} onChange={setNote} maxLength={500} />
        {source ? (
          <div className="text-caption text-text-secondary">
            {tc.rich("op.balance", {
              name: source.name,
              amount: formatMoney(source.balance),
              num: (chunks) => <span className="font-mono tabular-nums">{chunks}</span>,
            })}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

/** Sabab bilan amal (rad etish, bekor qilish). */
export function ReasonDialog(props: { title: string; action: string; onSubmit: (reason: string) => Promise<void>; onClose: () => void }) {
  const tc = useTranslations("cash");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [local, setLocal] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function submit() {
    setLocal(null);
    if (!reason.trim()) return setLocal(tc("reasonRequired"));
    setPending(true);
    setError(null);
    try {
      await props.onSubmit(reason.trim());
      props.onClose();
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  }
  const err = describeError(error);
  return (
    <Modal
      open
      onClose={props.onClose}
      title={props.title}
      tone="danger"
      size="sm"
      primaryAction={{ label: props.action, onClick: () => void submit(), loading: pending }}
    >
      <div className="flex flex-col gap-4">
        {err.message ? <Alert tone="danger" title={err.message} /> : null}
        {local ? <Alert tone="warning" title={local} /> : null}
        <TextField label={tc("reason")} value={reason} onChange={setReason} maxLength={300} required autoFocus />
      </div>
    </Modal>
  );
}
