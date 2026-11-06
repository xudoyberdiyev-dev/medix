"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { useChangePassword } from "@/features/auth/session";
import { ApiError } from "@/lib/api/client";
import { NETWORK_ERROR } from "@/lib/api/errors";

export const MIN_PASSWORD = 8;

type Values = { currentPassword: string; newPassword: string; repeat: string };
type Errors = Partial<Record<keyof Values, string>>;

export function validatePasswordForm(v: Values): Errors {
  const e: Errors = {};
  if (!v.currentPassword) e.currentPassword = "Joriy parol kiritilmagan. Administrator bergan parolni yozing.";
  if (v.newPassword.length < MIN_PASSWORD)
    e.newPassword = `Parol kamida ${MIN_PASSWORD} belgidan iborat boʻlishi kerak. Uzunroq parol tanlang.`;
  else if (v.newPassword === v.currentPassword) e.newPassword = "Yangi parol joriy paroldan farq qilishi kerak. Boshqa parol tanlang.";
  if (v.repeat !== v.newPassword) e.repeat = "Parollar mos kelmadi. Yangi parolni qayta yozing.";
  return e;
}

export function PasswordForm() {
  const router = useRouter();
  const change = useChangePassword();
  const [values, setValues] = useState<Values>({ currentPassword: "", newPassword: "", repeat: "" });
  const [errors, setErrors] = useState<Errors>({});

  function set(key: keyof Values) {
    return (v: string) => setValues((s) => ({ ...s, [key]: v }));
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const next = validatePasswordForm(values);
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    change.mutate(
      { currentPassword: values.currentPassword, newPassword: values.newPassword },
      {
        onSuccess: () => {
          toast({ tone: "success", title: "Parol almashtirildi" });
          router.replace("/");
        },
        onError: (err) => {
          if (err instanceof ApiError) setErrors(err.fieldErrors);
        },
      },
    );
  }

  const error = change.error;
  const message = error instanceof ApiError ? error.message : error ? NETWORK_ERROR : null;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <TextField
        label="Joriy parol"
        size="lg"
        variant="password"
        autoComplete="current-password"
        value={values.currentPassword}
        onChange={set("currentPassword")}
        error={errors.currentPassword}
        required
      />
      <TextField
        label="Yangi parol"
        size="lg"
        variant="password"
        autoComplete="new-password"
        value={values.newPassword}
        onChange={set("newPassword")}
        error={errors.newPassword}
        hint={`Kamida ${MIN_PASSWORD} belgi`}
        required
      />
      <TextField
        label="Yangi parolni takrorlang"
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
        Parolni saqlash
      </Button>
    </form>
  );
}
