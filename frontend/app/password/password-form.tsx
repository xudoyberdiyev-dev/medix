"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { useChangePassword } from "@/features/auth/session";
import { ApiError } from "@/lib/api/client";

export const MIN_PASSWORD = 8;

type Values = { currentPassword: string; newPassword: string; repeat: string };
/** Mahalliy tekshiruv xatosi — `password.errors.<kalit>`. */
export type PasswordErrorKey = "currentRequired" | "tooShort" | "sameAsCurrent" | "mismatch";
type Errors = Partial<Record<keyof Values, PasswordErrorKey>>;

export function validatePasswordForm(v: Values): Errors {
  const e: Errors = {};
  if (!v.currentPassword) e.currentPassword = "currentRequired";
  if (v.newPassword.length < MIN_PASSWORD) e.newPassword = "tooShort";
  else if (v.newPassword === v.currentPassword) e.newPassword = "sameAsCurrent";
  if (v.repeat !== v.newPassword) e.repeat = "mismatch";
  return e;
}

export function PasswordForm() {
  const t = useTranslations("password");
  const tc = useTranslations("common");
  const router = useRouter();
  const change = useChangePassword();
  const [values, setValues] = useState<Values>({ currentPassword: "", newPassword: "", repeat: "" });
  const [errors, setErrors] = useState<Partial<Record<keyof Values, string>>>({});

  function set(key: keyof Values) {
    return (v: string) => setValues((s) => ({ ...s, [key]: v }));
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const next = validatePasswordForm(values);
    const local: Partial<Record<keyof Values, string>> = {};
    for (const [k, key] of Object.entries(next) as [keyof Values, PasswordErrorKey][]) local[k] = t(`errors.${key}`, { min: MIN_PASSWORD });
    setErrors(local);
    if (Object.keys(next).length > 0) return;
    change.mutate(
      { currentPassword: values.currentPassword, newPassword: values.newPassword },
      {
        onSuccess: () => {
          toast({ tone: "success", title: t("changed") });
          router.replace("/");
        },
        onError: (err) => {
          if (err instanceof ApiError) setErrors(err.fieldErrors);
        },
      },
    );
  }

  const error = change.error;
  const message = error instanceof ApiError ? error.message : error ? tc("networkError") : null;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <TextField
        label={t("current")}
        size="lg"
        variant="password"
        autoComplete="current-password"
        value={values.currentPassword}
        onChange={set("currentPassword")}
        error={errors.currentPassword}
        required
      />
      <TextField
        label={t("new")}
        size="lg"
        variant="password"
        autoComplete="new-password"
        value={values.newPassword}
        onChange={set("newPassword")}
        error={errors.newPassword}
        hint={t("newHint", { min: MIN_PASSWORD })}
        required
      />
      <TextField
        label={t("repeat")}
        size="lg"
        variant="password"
        autoComplete="new-password"
        value={values.repeat}
        onChange={set("repeat")}
        error={errors.repeat}
        required
      />
      {message ? <Alert tone="danger" title={message} /> : null}
      <Button type="submit" size="lg" className="w-full" loading={change.isPending}>
        {t("save")}
      </Button>
    </form>
  );
}
