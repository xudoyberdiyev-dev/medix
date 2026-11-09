"use client";

import { ArrowRight, CircleAlert, Clock, Info, Lock, RotateCcw, User, WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Icon, type LucideIcon } from "@/components/ui/icon";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { AuthInput, CapsWarning, useCapsLock } from "@/features/auth/auth-input";
import { safeNext, useLogin } from "@/features/auth/session";
import { rememberTempPassword } from "@/features/auth/temp-password";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/cn";

type AlertKind = "danger" | "warning" | "info" | "offline";

const ALERTS: Record<AlertKind, { icon: LucideIcon; box: string; iconClass: string; text: string }> = {
  danger: { icon: CircleAlert, box: "border-danger/25 bg-danger-bg", iconClass: "text-danger", text: "text-danger" },
  warning: { icon: Clock, box: "border-warning/25 bg-warning-bg", iconClass: "text-warning", text: "text-warning" },
  info: { icon: Info, box: "border-info/25 bg-info-bg", iconClass: "text-info", text: "text-info" },
  offline: { icon: WifiOff, box: "border-border bg-table-header", iconClass: "text-danger", text: "text-text-primary" },
};

function LoginAlert({ kind, text, onRetry, retryLabel }: { kind: AlertKind; text: string; onRetry?: () => void; retryLabel: string }) {
  const a = ALERTS[kind];
  return (
    <div
      role={kind === "info" ? "status" : "alert"}
      className={cn("mt-[24px] flex gap-[10px] rounded-card border px-[14px] py-[12px]", a.box)}
    >
      <Icon icon={a.icon} className={cn("mt-px shrink-0", a.iconClass)} />
      <div className="flex min-w-0 flex-1 flex-col items-start gap-[10px]">
        <span className={cn("text-table text-pretty", a.text)}>{text}</span>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="flex h-[30px] items-center gap-[6px] rounded-card border border-border bg-surface px-[10px] text-table font-medium text-text-primary transition-colors duration-150 ease-out hover:bg-table-header"
          >
            <RotateCcw size={14} strokeWidth={1.5} aria-hidden className="text-text-secondary" />
            {retryLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Kirish formasi (prototip LoginScreen): sarlavha, xabar, Login/Parol ikonka bilan, Caps Lock, «Kirish →». */
export function LoginForm() {
  const t = useTranslations("login");
  const router = useRouter();
  const params = useSearchParams();
  const login = useLogin();
  const [values, setValues] = useState({ login: "", password: "" });
  const [errors, setErrors] = useState<{ login?: string; password?: string }>({});
  const [lockedFor, setLockedFor] = useState<string | null>(null);
  const caps = useCapsLock();
  const loginRef = useRef<HTMLInputElement>(null);
  const passRef = useRef<HTMLInputElement>(null);
  const reason = params.get("reason");

  useEffect(() => {
    if (params.get("out") === "1") toast({ tone: "success", title: t("loggedOut") });
    loginRef.current?.focus();
    // faqat birinchi ochilishda
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submit() {
    const next = {
      login: values.login.trim() ? undefined : t("requiredLogin"),
      password: values.password ? undefined : t("requiredPassword"),
    };
    setErrors(next);
    if (next.login) return loginRef.current?.focus();
    if (next.password) return passRef.current?.focus();
    const body = { login: values.login.trim(), password: values.password };
    login.mutate(body, {
      onSuccess: (me) => {
        rememberTempPassword(me.mustChangePassword ? body.password : null);
        router.replace(me.mustChangePassword ? "/password" : safeNext(params.get("next")));
      },
      onError: (err) => {
        if (!(err instanceof ApiError)) return;
        setErrors(err.fieldErrors);
        if (err.code === "auth.locked") setLockedFor(body.login.toLowerCase());
        else {
          setValues((v) => ({ ...v, password: "" }));
          passRef.current?.focus();
        }
      },
    });
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    submit();
  }

  const error = login.error;
  const busy = login.isPending;
  const locked = lockedFor !== null && lockedFor === values.login.trim().toLowerCase();
  let alert: { kind: AlertKind; text: string } | null = null;
  if (busy) alert = null;
  else if (error instanceof ApiError) {
    if (Object.keys(error.fieldErrors).length === 0)
      alert = { kind: error.code === "auth.locked" ? "warning" : "danger", text: error.message };
  } else if (error) alert = { kind: "offline", text: t("offline") };
  else if (reason === "session") alert = { kind: "info", text: t("session") };

  return (
    <>
      <h1 className="text-[26px] leading-8 font-semibold tracking-[-0.01em]">{t("title")}</h1>
      <p className="mt-[8px] text-body text-text-secondary">{t("subtitle")}</p>
      {alert ? (
        <LoginAlert kind={alert.kind} text={alert.text} retryLabel={t("retry")} onRetry={alert.kind === "offline" ? submit : undefined} />
      ) : null}
      <form onSubmit={onSubmit} noValidate className="mt-[32px] flex flex-col">
        <AuthInput
          id="mx-login"
          name="login"
          label={t("login")}
          icon={User}
          inputRef={loginRef}
          value={values.login}
          onChange={(v) => {
            setValues((s) => ({ ...s, login: v }));
            if (errors.login) setErrors((e) => ({ ...e, login: undefined }));
          }}
          disabled={busy}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          placeholder={t("loginPlaceholder")}
          error={errors.login}
        />
        <AuthInput
          id="mx-pass"
          name="password"
          className="mt-[16px]"
          label={t("password")}
          icon={Lock}
          password
          inputRef={passRef}
          value={values.password}
          onChange={(v) => {
            setValues((s) => ({ ...s, password: v }));
            if (errors.password) setErrors((e) => ({ ...e, password: undefined }));
          }}
          onKeyDown={caps.onKeyDown}
          onKeyUp={caps.onKeyUp}
          disabled={busy}
          autoComplete="current-password"
          placeholder={t("passwordPlaceholder")}
          error={errors.password}
        >
          <CapsWarning show={caps.caps && !busy} />
        </AuthInput>
        <button
          type="submit"
          disabled={busy || locked}
          aria-busy={busy || undefined}
          className={cn(
            "mt-[24px] flex h-[44px] w-full items-center justify-center gap-[8px] rounded-card text-subtitle font-medium transition-colors duration-150 ease-out",
            locked
              ? "cursor-not-allowed bg-background text-text-secondary"
              : "bg-primary-button text-white hover:bg-primary-button-hover active:bg-brand-900",
            busy && "cursor-progress",
          )}
        >
          {busy ? (
            <>
              <Spinner />
              {t("checking")}
            </>
          ) : (
            <>
              {t("submit")}
              <Icon icon={ArrowRight} />
            </>
          )}
        </button>
      </form>
      <p className="mt-[20px] text-center text-table text-pretty text-text-secondary">{t("forgot")}</p>
    </>
  );
}
