"use client";

import { ArrowRight, Check, Circle, CircleAlert, CircleCheck, Lock, LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/icon";
import { Spinner } from "@/components/ui/spinner";
import { AuthInput, CapsWarning, useCapsLock } from "@/features/auth/auth-input";
import { MIN_PASSWORD, PASSWORD_CHECKS, passwordChecks, passwordScore, passwordValid } from "@/features/auth/password-rules";
import { useChangePassword, useLogout, useMe } from "@/features/auth/session";
import { rememberTempPassword, tempPasswordValue } from "@/features/auth/temp-password";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/cn";

const SEGMENT = ["bg-danger", "bg-warning", "bg-primary", "bg-primary-button"] as const;
const SEGMENT_TEXT = ["text-danger", "text-warning", "text-primary", "text-primary-button"] as const;
/** «Parol saqlandi» dan keyin avtomatik davom etish. */
const CONTINUE_MS = 3000;

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/** Chiqish — yuqori oʻngda (prototip «Yangi parol oʻrnating»). */
export function PasswordExit() {
  const t = useTranslations("password");
  const router = useRouter();
  const logout = useLogout();
  return (
    <button
      type="button"
      onClick={() => logout.mutate(undefined, { onSettled: () => router.replace("/login?out=1") })}
      className="flex h-[30px] items-center gap-[6px] rounded-card px-[10px] text-table text-text-secondary transition-colors duration-150 ease-out hover:bg-background hover:text-text-primary"
    >
      <Icon icon={LogOut} />
      {t("exit")}
    </button>
  );
}

/** Vaqtinchalik parolni doimiysiga almashtirish (prototip `Medix ERP` → setpw): talablar, kuch, takror, «Parol saqlandi». */
export function PasswordForm() {
  const t = useTranslations("password");
  const tc = useTranslations("common");
  const router = useRouter();
  const me = useMe();
  const change = useChangePassword();
  const caps = useCapsLock();
  // Login sahifasidan kelganda vaqtinchalik parol xotirada — qayta soʻralmaydi.
  const [remembered] = useState(() => tempPasswordValue());
  const [current, setCurrent] = useState("");
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [shown, setShown] = useState(false);
  const [pw2Touched, setPw2Touched] = useState(false);
  const [tried, setTried] = useState(false);
  const [errors, setErrors] = useState<{ current?: string; pw1?: string; pw2?: string }>({});
  const [done, setDone] = useState(false);
  const pw1Ref = useRef<HTMLInputElement>(null);

  const currentValue = remembered ?? current;
  const checks = passwordChecks(pw1, currentValue);
  const score = passwordScore(pw1);
  const mismatch = (pw2Touched || tried) && pw2 !== "" && pw1 !== pw2;
  const busy = change.isPending;

  const goOn = () => router.replace("/");
  useEffect(() => {
    if (!done) return;
    const id = window.setTimeout(goOn, CONTINUE_MS);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setTried(true);
    const next = {
      current: remembered === null && !current ? t("errors.currentRequired") : undefined,
      pw1: passwordValid(pw1, currentValue) ? undefined : t("errors.requirements"),
      pw2: pw2 !== pw1 ? t("errors.mismatch") : undefined,
    };
    setErrors(next);
    if (next.current || next.pw1 || next.pw2) return;
    change.mutate(
      { currentPassword: currentValue, newPassword: pw1 },
      {
        onSuccess: () => {
          rememberTempPassword(null);
          setDone(true);
        },
        onError: (err) => {
          if (!(err instanceof ApiError)) return;
          setErrors({ current: err.fieldErrors.currentPassword, pw1: err.fieldErrors.newPassword });
        },
      },
    );
  }

  if (done) {
    return (
      <div className="flex flex-col items-center text-center" role="status">
        <span className="flex size-[80px] items-center justify-center rounded-full bg-success-bg text-success">
          <CircleCheck size={48} strokeWidth={1.5} aria-hidden />
        </span>
        <h1 className="mt-[20px] text-[22px] leading-7 font-semibold">{t("doneTitle")}</h1>
        <p className="mt-[8px] text-body text-text-secondary">{t("doneSub")}</p>
        <button
          type="button"
          onClick={goOn}
          className="mt-[28px] flex h-[44px] w-full items-center justify-center gap-[8px] rounded-card bg-primary-button text-subtitle font-medium text-white transition-colors duration-150 ease-out hover:bg-primary-button-hover active:bg-brand-900"
        >
          {t("continue")}
          <Icon icon={ArrowRight} />
        </button>
        <div className="mt-[12px] h-[2px] w-full overflow-hidden rounded-full bg-background" aria-hidden>
          <div className="h-full animate-progress bg-primary" style={{ animationDuration: `${CONTINUE_MS}ms` }} />
        </div>
      </div>
    );
  }

  const error = change.error;
  const message =
    error instanceof ApiError ? (Object.keys(error.fieldErrors).length ? null : error.message) : error ? tc("networkError") : null;
  const name = me.data?.fullName ?? "";

  return (
    <div className="flex flex-col">
      {me.data ? (
        <div className="flex">
          <div className="flex max-w-full items-center gap-[8px] rounded-full bg-background py-[4px] pr-[12px] pl-[4px]">
            <span className="flex size-[28px] flex-none items-center justify-center rounded-full bg-primary-soft text-[11px] font-semibold text-primary-button">
              {initials(name)}
            </span>
            <span className="truncate text-table font-medium">{name}</span>
            <span className="font-mono text-caption whitespace-nowrap text-text-secondary">{me.data.login}</span>
          </div>
        </div>
      ) : null}
      <h1 className="mt-[20px] text-[26px] leading-8 font-semibold tracking-[-0.01em] text-pretty">{t("title")}</h1>
      <p className="mt-[8px] text-body text-pretty text-text-secondary">{t("intro")}</p>
      {message ? (
        <div
          role="alert"
          className="mt-[24px] flex gap-[10px] rounded-card border border-danger/25 bg-danger-bg px-[14px] py-[12px] text-table text-danger"
        >
          <Icon icon={CircleAlert} className="mt-px shrink-0" />
          {message}
        </div>
      ) : null}
      <form onSubmit={onSubmit} noValidate className="mt-[28px] flex flex-col">
        {remembered === null ? (
          <AuthInput
            id="mx-cur"
            className="mb-[16px]"
            label={t("current")}
            icon={Lock}
            password
            value={current}
            onChange={setCurrent}
            disabled={busy}
            autoComplete="current-password"
            placeholder={t("currentPlaceholder")}
            error={errors.current}
          />
        ) : null}
        <AuthInput
          id="mx-np1"
          label={t("new")}
          icon={Lock}
          password
          shown={shown}
          onToggleShown={() => setShown((v) => !v)}
          inputRef={pw1Ref}
          value={pw1}
          onChange={setPw1}
          onKeyDown={caps.onKeyDown}
          onKeyUp={caps.onKeyUp}
          disabled={busy}
          autoComplete="new-password"
          placeholder={t("newPlaceholder")}
          error={errors.pw1}
          autoFocus={remembered !== null}
        >
          <div className="mt-[8px] flex h-[16px] items-center gap-[12px]">
            <div className="grid flex-1 grid-cols-4 gap-[4px]" aria-hidden>
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={cn(
                    "h-[4px] rounded-sm transition-colors duration-150 ease-out",
                    i < score ? SEGMENT[score - 1] : "bg-background",
                  )}
                />
              ))}
            </div>
            <span
              className={cn("min-w-[64px] text-right text-caption font-medium whitespace-nowrap", score ? SEGMENT_TEXT[score - 1] : "")}
            >
              {score ? t(`strength.${score}`) : ""}
            </span>
          </div>
          <CapsWarning show={caps.caps && !busy} />
          <ul className="mt-[12px] flex flex-col gap-[6px]">
            {PASSWORD_CHECKS.map((k) => {
              const ok = checks[k];
              return (
                <li
                  key={k}
                  className={cn(
                    "flex items-center gap-[8px] text-table transition-colors duration-150 ease-out",
                    ok ? "text-success" : tried ? "text-danger" : "text-text-secondary",
                  )}
                >
                  <Icon icon={ok ? CircleCheck : Circle} />
                  {t(`req.${k}`, { min: MIN_PASSWORD })}
                </li>
              );
            })}
          </ul>
        </AuthInput>
        <AuthInput
          id="mx-np2"
          className="mt-[16px]"
          label={t("repeat")}
          icon={Lock}
          masked
          shown={shown}
          value={pw2}
          onChange={setPw2}
          onBlur={() => setPw2Touched(true)}
          onKeyDown={caps.onKeyDown}
          onKeyUp={caps.onKeyUp}
          disabled={busy}
          autoComplete="new-password"
          placeholder={t("repeatPlaceholder")}
          error={mismatch ? t("errors.mismatch") : errors.pw2}
          trailing={pw2 !== "" && pw1 === pw2 ? <Check size={16} strokeWidth={1.5} className="text-success" aria-hidden /> : undefined}
        />
        <button
          type="submit"
          disabled={busy}
          aria-busy={busy || undefined}
          className={cn(
            "mt-[24px] flex min-h-[44px] w-full items-center justify-center gap-[10px] rounded-card bg-primary-button px-[12px] text-subtitle font-medium text-white transition-colors duration-150 ease-out hover:bg-primary-button-hover active:bg-brand-900",
            busy && "cursor-progress",
          )}
        >
          {busy ? (
            <>
              <Spinner />
              {t("saving")}
            </>
          ) : (
            t("save")
          )}
        </button>
      </form>
      <p className="mt-[16px] text-center text-caption text-pretty text-text-secondary">{t("tip")}</p>
    </div>
  );
}
