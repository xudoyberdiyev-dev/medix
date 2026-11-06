"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { ensureCsrf } from "@/features/auth/session";
import { parseUzDate, formatIsoDate, todayTashkent } from "@/features/counterparties/api";
import { useExpenseItems } from "@/features/dictionaries/api";
import { ACCOUNT_KIND, type MoneyAccount } from "@/features/payments/api";
import { describeError } from "@/features/setup/form-error";
import { api, unwrap } from "@/lib/api/client";
import { formatMoney } from "@/lib/format";
import { isOverApprovalLimit } from "./api";

export async function refreshMoney(qc: ReturnType<typeof useQueryClient>) {
  await Promise.all(
    ["money-accounts", "cash-ops", "money-transfers", "cash-close", "payments"].map((k) => qc.invalidateQueries({ queryKey: [k] })),
  );
}

const accountOptions = (accounts: MoneyAccount[]) =>
  accounts.filter((a) => a.active).map((a) => ({ value: String(a.id), label: a.name, sub: `${ACCOUNT_KIND[a.kind]} · ${a.code}` }));

/** KO / BO: kirim yoki chiqim, modda bilan. Kassadan 2 000 000 soʻmdan katta chiqim tasdiqqa ketadi. */
export function CashOpDialog(props: { branchId: number; accounts: MoneyAccount[]; defaultAccount: number | null; onClose: () => void }) {
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
    if (!account) return setLocal("Hisobni tanlang.");
    if (!item) return setLocal(direction === "OUT" ? "Xarajat moddasini tanlang." : "Kirim moddasini tanlang.");
    if (!amount) return setLocal("Summani kiriting.");
    const iso = parseUzDate(date);
    if (iso === null) return setLocal("Sana notoʻgʻri. Masalan: 04.10.2026.");
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
        title: r.status === "PENDING" ? "Chiqim tasdiqqa yuborildi" : direction === "OUT" ? "Chiqim yozildi" : "Kirim yozildi",
        description: `${r.number} · ${formatMoney(r.amount)} soʻm`,
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
      title={direction === "OUT" ? "Chiqim (KO / BO)" : "Kirim (KO / BO)"}
      primaryAction={{ label: needsApproval ? "Tasdiqqa yuborish" : "Yozish", onClick: () => void submit(), loading: pending }}
    >
      <div className="flex flex-col gap-4">
        {err.message ? <Alert tone="danger" title={err.message} /> : null}
        {local ? <Alert tone="warning" title={local} /> : null}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Select
            label="Yoʻnalish"
            value={direction}
            onChange={(v) => {
              setDirection(v === "IN" ? "IN" : "OUT");
              setItem(null);
            }}
            options={[
              { value: "OUT", label: "Chiqim" },
              { value: "IN", label: "Kirim" },
            ]}
          />
          <Select label="Hisob" value={account} onChange={setAccount} options={accountOptions(props.accounts)} />
          <Select
            label={direction === "OUT" ? "Xarajat moddasi" : "Kirim moddasi"}
            value={item}
            onChange={setItem}
            options={itemOptions}
            placeholder={items.isPending ? "Yuklanmoqda…" : "Tanlang"}
          />
          <TextField label="Summa" variant="amount" value={amount} onChange={setAmount} required suffix="soʻm" />
          <TextField label="Sana" value={date} onChange={setDate} placeholder="04.10.2026" />
          <TextField label={direction === "OUT" ? "Kimga" : "Kimdan"} value={party} onChange={setParty} maxLength={200} />
        </div>
        <TextField label="Izoh" value={note} onChange={setNote} maxLength={500} />
        {needsApproval ? (
          <Alert tone="info" title="Kassadan 2.000.000,00 soʻmdan katta chiqim — Filial rahbari tasdiqlagach oʻtkaziladi." />
        ) : null}
        {selected ? (
          <div className="text-caption text-text-secondary">
            «{selected.name}» qoldigʻi: <span className="font-mono tabular-nums">{formatMoney(selected.balance)} soʻm</span>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

/** IO: bir filial hisoblari orasida (kassa → bank, Terminal → bank, …). Darhol oʻtkaziladi. */
export function TransferDialog(props: { branchId: number; accounts: MoneyAccount[]; defaultFrom: number | null; onClose: () => void }) {
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
    if (!from || !to) return setLocal("Qaysi hisobdan va qaysi hisobga — ikkalasini tanlang.");
    if (from === to) return setLocal("Bitta hisobdan oʻziga oʻtkazib boʻlmaydi. Boshqa hisobni tanlang.");
    if (!amount) return setLocal("Summani kiriting.");
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
        title: "Oʻtkazma yozildi",
        description: `${r.number} · ${r.fromAccount} → ${r.toAccount} · ${formatMoney(r.amount)} soʻm`,
      });
      props.onClose();
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  }

  const err = describeError(error);
  const options = accountOptions(props.accounts);
  return (
    <Modal
      open
      onClose={props.onClose}
      title="Hisoblar orasida oʻtkazma (IO)"
      primaryAction={{ label: "Oʻtkazish", onClick: () => void submit(), loading: pending }}
    >
      <div className="flex flex-col gap-4">
        {err.message ? <Alert tone="danger" title={err.message} /> : null}
        {local ? <Alert tone="warning" title={local} /> : null}
        <Select label="Qaysi hisobdan" value={from} onChange={setFrom} options={options} />
        <Select label="Qaysi hisobga" value={to} onChange={setTo} options={options.filter((o) => o.value !== from)} />
        <TextField label="Summa" variant="amount" value={amount} onChange={setAmount} required suffix="soʻm" />
        <TextField label="Izoh" value={note} onChange={setNote} maxLength={500} />
        {source ? (
          <div className="text-caption text-text-secondary">
            «{source.name}» qoldigʻi: <span className="font-mono tabular-nums">{formatMoney(source.balance)} soʻm</span>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

/** Sabab bilan amal (rad etish, bekor qilish). */
export function ReasonDialog(props: { title: string; action: string; onSubmit: (reason: string) => Promise<void>; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [local, setLocal] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function submit() {
    setLocal(null);
    if (!reason.trim()) return setLocal("Sababini yozing.");
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
        <TextField label="Sabab" value={reason} onChange={setReason} maxLength={300} required autoFocus />
      </div>
    </Modal>
  );
}
