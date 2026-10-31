"use client";

import { Eye, EyeOff, Info } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";

const fieldClass =
  "h-control-lg w-full rounded-control border border-border bg-surface px-3 text-body placeholder:text-text-disabled hover:border-text-disabled";

export function LoginForm() {
  const loginId = useId();
  const passwordId = useId();
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState(false);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Server bilan ulanish 1-bosqichda (Identifikatsiya) qoʻshiladi.
    setNotice(true);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <div className="flex flex-col gap-1">
        <label htmlFor={loginId} className="font-medium">
          Login
        </label>
        <input id={loginId} name="login" autoComplete="username" className={fieldClass} placeholder="Loginni kiriting" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={passwordId} className="font-medium">
          Parol
        </label>
        <div className="relative">
          <input
            id={passwordId}
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            className={`${fieldClass} pr-11`}
            placeholder="Parolni kiriting"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Parolni yashirish" : "Parolni koʻrsatish"}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-text-secondary"
          >
            {showPassword ? <EyeOff size={16} strokeWidth={1.5} /> : <Eye size={16} strokeWidth={1.5} />}
          </button>
        </div>
      </div>
      {notice ? (
        <div role="status" className="flex gap-3 rounded-card bg-info-bg p-3 text-info">
          <Info size={20} strokeWidth={1.5} aria-hidden className="shrink-0" />
          <span>Tizimga kirish keyingi bosqichda ulanadi. Hozir bu sahifa faqat koʻrinish uchun.</span>
        </div>
      ) : null}
      <Button type="submit" size="lg" className="w-full">
        Tizimga kirish
      </Button>
    </form>
  );
}
