"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Modal } from "@/components/ui/modal";
import { TextField } from "@/components/ui/text-field";
import { describeError } from "@/features/setup/form-error";

/** Nofaol qilish oynasi: sabab majburiy, oqibati yoziladi (filial/ombor oʻchirilmaydi — SPEC 13). */
export function DeactivateDialog({
  title,
  consequence,
  actionLabel,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  title: string;
  consequence: string;
  actionLabel: string;
  pending: boolean;
  error: unknown;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations("organization");
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState<string>();
  const err = describeError(error);
  return (
    <Modal
      open
      onClose={onClose}
      tone="danger"
      size="sm"
      title={title}
      primaryAction={{
        label: actionLabel,
        loading: pending,
        onClick: () => {
          if (!reason.trim()) return setLocalError(t("reasonRequired"));
          onConfirm(reason.trim());
        },
      }}
    >
      <p>{consequence}</p>
      <div className="mt-4">
        <TextField label={t("reason")} value={reason} onChange={setReason} error={localError ?? err.fields.reason} required autoFocus />
      </div>
      {err.message ? <Alert tone="danger" title={err.message} className="mt-4" /> : null}
    </Modal>
  );
}
