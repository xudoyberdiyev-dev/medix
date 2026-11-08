"use client";

import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { safeNext, useLogin } from "@/features/auth/session";
import { ApiError } from "@/lib/api/client";

export function LoginHeading() {
  const t = useTranslations("login");
  return (
    <>
      <h1 className="text-section-title">{t("title")}</h1>
      <p className="mt-1 mb-8 text-text-secondary">{t("subtitle")}</p>
    </>
  );
}

export function LoginForm() {
  const t = useTranslations("login");
  const tc = useTranslations("common");
  const router = useRouter();
  const params = useSearchParams();
  const login = useLogin();
  const [values, setValues] = useState({ login: "", password: "" });
  const [errors, setErrors] = useState<{ login?: string; password?: string }>({});

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const next = {
      login: values.login.trim() ? undefined : t("requiredLogin"),
      password: values.password ? undefined : t("requiredPassword"),
    };
    setErrors(next);
    if (next.login || next.password) return;
    login.mutate(
      { login: values.login.trim(), password: values.password },
      {
        onSuccess: (me) => router.replace(me.mustChangePassword ? "/password" : safeNext(params.get("next"))),
        onError: (err) => {
          if (err instanceof ApiError) setErrors(err.fieldErrors);
        },
      },
    );
  }

  const error = login.error;
  const message = error instanceof ApiError ? error.message : error ? tc("networkError") : null;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <TextField
        label={t("login")}
        size="lg"
        name="login"
        autoComplete="username"
        placeholder={t("loginPlaceholder")}
        value={values.login}
        onChange={(v) => setValues((s) => ({ ...s, login: v }))}
        error={errors.login}
        autoFocus
      />
      <TextField
        label={t("password")}
        size="lg"
        variant="password"
        name="password"
        autoComplete="current-password"
        placeholder={t("passwordPlaceholder")}
        value={values.password}
        onChange={(v) => setValues((s) => ({ ...s, password: v }))}
        error={errors.password}
      />
      {message ? <Alert tone="danger" title={message} /> : null}
      <Button type="submit" size="lg" className="w-full" loading={login.isPending}>
        {t("submit")}
      </Button>
    </form>
  );
}
