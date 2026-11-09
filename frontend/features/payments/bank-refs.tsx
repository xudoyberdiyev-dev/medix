"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { TextField } from "@/components/ui/text-field";
import { formatIsoDate, parseUzDate } from "@/features/counterparties/api";

/** Toʻlov rekvizitlari (prototip PaymentDoc): bank — topshiriqnoma № (majburiy) va bank sanasi; terminal — chek raqami (majburiy). */
export interface BankRefsValue {
  payOrderNo: string;
  bankDate: string;
  checkNo: string;
}

/** Sof tekshiruv: hisob turiga qarab kerakli maydonlar; boshqa turdagi maydonlar yuborilmaydi. */
export function checkRefs(
  kind: string | undefined,
  v: BankRefsValue,
): { ok: true; body: Record<string, string | undefined> } | { ok: false; key: string } {
  if (kind === "BANK") {
    if (!v.payOrderNo.trim()) return { ok: false, key: "payOrderNoRequired" };
    const iso = parseUzDate(v.bankDate);
    if (iso === null) return { ok: false, key: "badBankDate" };
    return { ok: true, body: { payOrderNo: v.payOrderNo.trim(), bankDate: iso } };
  }
  if (kind === "TERMINAL") {
    if (!v.checkNo.trim()) return { ok: false, key: "checkNoRequired" };
    return { ok: true, body: { checkNo: v.checkNo.trim() } };
  }
  return { ok: true, body: {} };
}

export function useBankRefs(doc?: { payOrderNo?: string | null; bankDate?: string | null; checkNo?: string | null } | null) {
  return useState<BankRefsValue>({
    payOrderNo: doc?.payOrderNo ?? "",
    bankDate: doc?.bankDate ? formatIsoDate(doc.bankDate) : "",
    checkNo: doc?.checkNo ?? "",
  });
}

export function BankRefFields({
  kind,
  value,
  onChange,
  disabled,
}: {
  kind: string | undefined;
  value: BankRefsValue;
  onChange: (v: BankRefsValue) => void;
  disabled: boolean;
}) {
  const t = useTranslations("payments.refs");
  if (kind === "BANK")
    return (
      <>
        <TextField
          label={t("payOrderNo")}
          value={value.payOrderNo}
          onChange={(payOrderNo) => onChange({ ...value, payOrderNo })}
          placeholder="0702"
          maxLength={30}
          required
          disabled={disabled}
        />
        <TextField
          label={t("bankDate")}
          value={value.bankDate}
          onChange={(bankDate) => onChange({ ...value, bankDate })}
          placeholder="04.10.2026"
          disabled={disabled}
        />
      </>
    );
  if (kind === "TERMINAL")
    return (
      <TextField
        label={t("checkNo")}
        value={value.checkNo}
        onChange={(checkNo) => onChange({ ...value, checkNo })}
        placeholder="004811"
        maxLength={30}
        required
        disabled={disabled}
      />
    );
  return null;
}
