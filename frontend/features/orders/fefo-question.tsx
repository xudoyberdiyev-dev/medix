"use client";

import { Layers } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Checkbox } from "@/components/ui/selection-controls";
import { useMe } from "@/features/auth/session";
import { setFefoPref } from "./fefo-invoice-pref";

/**
 * O25: «Seriya va muddat FEFO boʻyicha koʻrsatilsinmi?» — yigʻilmagan buyurtmaning ombor fakturasi oldidan.
 * Tugmalar oynaning oʻzida (asosiy — «Ha, FEFO bilan», ikkinchi — «Yoʻq, oddiy»); «Har safar soʻralmasin» belgilansa —
 * tanlov shu foydalanuvchi uchun eslab qolinadi.
 */
export function useFefoChoice(onChoose: (fefo: boolean) => void) {
  const me = useMe();
  const [remember, setRemember] = useState(false);
  return {
    remember,
    setRemember,
    choose(fefo: boolean) {
      if (remember) setFefoPref(me.data?.id, fefo ? "yes" : "no");
      onChoose(fefo);
    },
  };
}

export function FefoQuestionBody({ remember, setRemember }: { remember: boolean; setRemember: (v: boolean) => void }) {
  const t = useTranslations("orders.invoiceForms");
  return (
    <section aria-labelledby="fefo-question-title" data-testid="fefo-question" className="flex flex-col gap-3">
      <div className="flex items-start gap-3 rounded-card border border-border bg-background p-4">
        <Layers size={20} strokeWidth={1.5} aria-hidden className="mt-0.5 shrink-0 text-primary" />
        <div className="flex flex-col gap-1">
          <h3 id="fefo-question-title" className="text-body font-semibold">
            {t("fefoTitle")}
          </h3>
          <p className="text-caption text-text-secondary">{t("fefoText")}</p>
        </div>
      </div>
      <Checkbox label={t("fefoRemember")} description={t("fefoRememberNote")} checked={remember} onChange={setRemember} />
    </section>
  );
}

/** Ommaviy chop etish (reys / roʻyxat): soʻrov bir marta, alohida oynada. */
export function FefoQuestionModal({ onChoose, onClose }: { onChoose: (fefo: boolean) => void; onClose: () => void }) {
  const t = useTranslations("orders.invoiceForms");
  const c = useFefoChoice(onChoose);
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={t("fefoSwitch")}
      primaryAction={{ label: t("fefoYes"), onClick: () => c.choose(true) }}
      secondaryAction={{ label: t("fefoNo"), onClick: () => c.choose(false) }}
    >
      <FefoQuestionBody remember={c.remember} setRemember={c.setRemember} />
    </Modal>
  );
}
