"use client";

import { useQueryClient } from "@tanstack/react-query";
import { LockKeyhole } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Select } from "@/components/ui/select";
import { ErrorState, Skeleton } from "@/components/ui/system-states";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { can } from "@/features/auth/can";
import { ensureCsrf, useMe } from "@/features/auth/session";
import { formatIsoDate } from "@/features/counterparties/api";
import type { MoneyAccount } from "@/features/payments/api";
import { describeError } from "@/features/setup/form-error";
import { api, unwrap } from "@/lib/api/client";
import { formatMoney } from "@/lib/format";
import { CASH_CLOSE_DIFF, countedTotal, fromCents, toCents, useClosePreview } from "./api";
import { refreshMoney } from "./op-dialogs";

/**
 * Kunni yopish (SPEC 5.5): faqat kassa. Kupyuralar sanalib, kutilgan qoldiq bilan solishtiriladi. Farq bo'lsa — Filial rahbari
 * izoh va PIN bilan yopadi (farq tuzatuvchi KO bo'lib yoziladi). Yopilgan kunga yangi hujjat kiritilmaydi.
 */
export function CloseDrawer(props: { accounts: MoneyAccount[]; defaultAccount: number | null; onClose: () => void }) {
  const me = useMe();
  const qc = useQueryClient();
  const kassas = props.accounts.filter((a) => a.kind === "CASH" && a.active);
  const initial = kassas.find((a) => a.id === props.defaultAccount) ?? kassas[0];
  const [account, setAccount] = useState<string | null>(initial ? String(initial.id) : null);
  const preview = useClosePreview(account ? Number(account) : null, null);
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [coins, setCoins] = useState("");
  const [note, setNote] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [local, setLocal] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const mayDiff = can(me.data, CASH_CLOSE_DIFF);

  const counted = countedTotal(counts, coins);
  const expected = preview.data?.expected ?? "0.00";
  const diff = fromCents(toCents(counted) - toCents(expected));
  const hasDiff = diff !== "0.00";

  async function submit() {
    setLocal(null);
    setError(null);
    if (!account || !preview.data) return setLocal("Kassani tanlang.");
    if (hasDiff && !mayDiff) return setLocal("Sanoqda farq bor. Qayta sanang yoki Filial rahbarini chaqiring — farq bilan faqat u yopadi.");
    if (hasDiff && !note.trim()) return setLocal("Farq sababini izohda yozing.");
    if (hasDiff && !pin.trim()) return setLocal("Tasdiqlash uchun PIN kiriting.");
    setPending(true);
    try {
      await ensureCsrf();
      const r = await unwrap(
        api.POST("/api/cash-close", {
          body: {
            accountId: Number(account),
            closeDate: preview.data.closeDate,
            denominations: preview.data.nominals.map((n) => ({ nominal: n, count: Number(counts[n] || "0") || 0 })),
            coins: coins || undefined,
            note: note.trim() || undefined,
            pin: hasDiff ? pin.trim() : undefined,
          },
        }),
      );
      await refreshMoney(qc);
      toast({
        tone: "success",
        title: `Kun yopildi: ${formatIsoDate(r.closeDate)}`,
        description: r.correctionNumber
          ? `Farq ${formatMoney(r.diff)} soʻm · ${r.correctionNumber}`
          : `${r.account} · ${formatMoney(r.counted)} soʻm`,
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
    <Drawer
      open
      onClose={props.onClose}
      size="lg"
      kind="Kassa"
      title="Kunni yopish"
      subtitle={preview.data ? `${preview.data.account} · ${formatIsoDate(preview.data.closeDate)}` : undefined}
      actions={
        <Button icon={LockKeyhole} loading={pending} disabled={!preview.data || preview.data.pendingOps > 0} onClick={() => void submit()}>
          Kunni yopish
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {err.message ? <Alert tone="danger" title={err.message} /> : null}
        {local ? <Alert tone="warning" title={local} /> : null}
        {kassas.length > 1 ? (
          <Select
            label="Kassa"
            value={account}
            onChange={(v) => {
              setAccount(v);
              setCounts({});
              setCoins("");
            }}
            options={kassas.map((a) => ({ value: String(a.id), label: a.name, sub: a.code }))}
          />
        ) : null}
        {preview.error ? (
          <ErrorState onRetry={() => preview.refetch()} />
        ) : !preview.data ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <>
            {preview.data.lastClosed ? (
              <div className="text-caption text-text-secondary">Oxirgi yopilgan kun: {formatIsoDate(preview.data.lastClosed)}</div>
            ) : null}
            {preview.data.pendingOps > 0 ? (
              <Alert
                tone="warning"
                title={`Tasdiqlashni kutayotgan chiqim bor (${preview.data.pendingOps} ta). Avval Filial rahbari tasdiqlasin yoki rad etsin.`}
              />
            ) : null}
            <dl className="grid grid-cols-3 gap-4">
              <Stat label="Kun kirimi" value={preview.data.income} />
              <Stat label="Kun chiqimi" value={preview.data.expense} />
              <Stat label="Kutilgan qoldiq" value={expected} strong />
            </dl>
            <div>
              <h3 className="mb-2 text-subtitle">Kupyuralar sanogʻi</h3>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {preview.data.nominals.map((n) => (
                  <TextField
                    key={n}
                    label={`${formatMoney(String(n)).replace(/,00$/, "")} soʻm`}
                    value={counts[n] ?? ""}
                    onChange={(v) => setCounts((c) => ({ ...c, [n]: v.replace(/\D/g, "") }))}
                    inputMode="numeric"
                    suffix="dona"
                    size="sm"
                  />
                ))}
                <TextField label="Mayda pul / tiyin" variant="amount" value={coins} onChange={setCoins} suffix="soʻm" size="sm" />
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-4 border-t border-border pt-4">
              <Stat label="Sanaldi" value={counted} strong />
              <Stat label="Farq" value={diff} tone={hasDiff ? "danger" : "success"} strong />
            </dl>
            {hasDiff ? (
              mayDiff ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="md:col-span-2">
                    <TextField label="Farq sababi" value={note} onChange={setNote} maxLength={500} required />
                  </div>
                  <TextField label="PIN" variant="password" value={pin} onChange={setPin} maxLength={6} inputMode="numeric" required />
                </div>
              ) : (
                <Alert tone="warning" title="Sanoqda farq bor">
                  Qayta sanang. Farq qolsa — Filial rahbarini chaqiring: u izoh va PIN bilan yopadi, farq tuzatuvchi KO boʻlib yoziladi.
                </Alert>
              )
            ) : null}
          </>
        )}
      </div>
    </Drawer>
  );
}

function Stat(props: { label: string; value: string; strong?: boolean; tone?: "danger" | "success" }) {
  const color = props.tone === "danger" ? "text-danger" : props.tone === "success" ? "text-success" : "";
  return (
    <div>
      <dt className="text-caption text-text-secondary">{props.label}</dt>
      <dd className={`font-mono tabular-nums ${props.strong ? "text-subtitle" : ""} ${color}`}>{formatMoney(props.value)} soʻm</dd>
    </div>
  );
}
