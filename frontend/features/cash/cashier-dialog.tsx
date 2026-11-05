"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/system-states";
import { toast } from "@/components/ui/toast";
import { ensureCsrf } from "@/features/auth/session";
import type { MoneyAccount } from "@/features/payments/api";
import { describeError } from "@/features/setup/form-error";
import { api, unwrap } from "@/lib/api/client";
import { useCashierOptions } from "./api";

const NONE = "none";

/** Kassalarga kassir biriktirish (Filial rahbari, Direktor, Admin). Kassir amallarni faqat oʻz kassasida bajaradi. */
export function CashierDialog(props: { branchId: number; accounts: MoneyAccount[]; onClose: () => void }) {
  const qc = useQueryClient();
  const kassas = props.accounts.filter((a) => a.kind === "CASH" && a.active);
  const options = useCashierOptions(props.branchId, true);
  const initial = Object.fromEntries(kassas.map((a) => [a.id, a.cashierId != null ? String(a.cashierId) : NONE]));
  const [values, setValues] = useState<Record<number, string>>(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const changed = kassas.filter((a) => values[a.id] !== initial[a.id]);

  async function save() {
    setPending(true);
    setError(null);
    try {
      await ensureCsrf();
      for (const a of changed) {
        const v = values[a.id];
        await unwrap(
          api.PUT("/api/money-accounts/{id}/cashier", {
            params: { path: { id: a.id } },
            body: { cashierId: v === NONE || v == null ? undefined : Number(v) },
          }),
        );
      }
      await qc.invalidateQueries({ queryKey: ["money-accounts"] });
      toast({ tone: "success", title: "Kassirlar saqlandi" });
      props.onClose();
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  }

  const err = describeError(error);
  const people = [
    { value: NONE, label: "Biriktirilmagan", sub: "Kassasi yoʻq xodimlar ishlatadi" },
    ...(options.data ?? []).map((o) => ({ value: String(o.id), label: o.fullName, sub: o.cashName ?? undefined })),
  ];
  return (
    <Modal
      open
      onClose={props.onClose}
      title="Kassirlar"
      primaryAction={{ label: "Saqlash", onClick: () => void save(), loading: pending, disabled: changed.length === 0 }}
      secondaryAction={{ label: "Bekor qilish", onClick: props.onClose }}
    >
      <div className="flex flex-col gap-4">
        <p className="text-text-secondary">
          Kassir faqat oʻziga biriktirilgan kassada ishlaydi. Filial rahbari, Direktor va Admin istalgan kassada ishlay oladi.
        </p>
        {err.message ? <Alert tone="danger" title={err.message} /> : null}
        {options.error ? (
          <Alert tone="danger" title="Xodimlar roʻyxati yuklanmadi. Oynani yopib, qayta oching." />
        ) : options.isPending ? (
          <Skeleton className="h-20 w-full" />
        ) : (
          kassas.map((a) => (
            <Select
              key={a.id}
              label={`${a.name} · ${a.code}`}
              value={values[a.id] ?? NONE}
              onChange={(v) => setValues((s) => ({ ...s, [a.id]: v ?? NONE }))}
              options={people}
            />
          ))
        )}
      </div>
    </Modal>
  );
}
