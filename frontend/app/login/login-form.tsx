"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { safeNext, useLogin } from "@/features/auth/session";
import { ApiError } from "@/lib/api/client";
import { NETWORK_ERROR } from "@/lib/api/errors";

const REQUIRED_LOGIN = "Login kiritilmagan. Administrator bergan loginni yozing.";
const REQUIRED_PASSWORD = "Parol kiritilmagan. Parolni yozing.";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const login = useLogin();
  const [values, setValues] = useState({ login: "", password: "" });
  const [errors, setErrors] = useState<{ login?: string; password?: string }>({});

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const next = {
      login: values.login.trim() ? undefined : REQUIRED_LOGIN,
      password: values.password ? undefined : REQUIRED_PASSWORD,
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
  const message = error instanceof ApiError ? error.message : error ? NETWORK_ERROR : null;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <TextField
        label="Login"
        size="lg"
        name="login"
        autoComplete="username"
        placeholder="Loginni kiriting"
        value={values.login}
        onChange={(v) => setValues((s) => ({ ...s, login: v }))}
        error={errors.login}
        autoFocus
      />
      <TextField
        label="Parol"
        size="lg"
        variant="password"
        name="password"
        autoComplete="current-password"
        placeholder="Parolni kiriting"
        value={values.password}
        onChange={(v) => setValues((s) => ({ ...s, password: v }))}
        error={errors.password}
      />
      {message ? <Alert tone="danger" title={message} /> : null}
      <Button type="submit" size="lg" className="w-full" loading={login.isPending}>
        Tizimga kirish
      </Button>
    </form>
  );
}
