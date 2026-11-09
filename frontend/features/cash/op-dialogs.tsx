"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Modal } from "@/components/ui/modal";
import { TextField } from "@/components/ui/text-field";
import { describeError } from "@/features/setup/form-error";

export async function refreshMoney(qc: ReturnType<typeof useQueryClient>) {
  await Promise.all(
    ["money-accounts", "cash-ops", "money-transfers", "cash-close", "payments"].map((k) => qc.invalidateQueries({ queryKey: [k] })),
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
