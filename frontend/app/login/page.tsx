import type { Metadata } from "next";
import { Suspense } from "react";
import { LanguageSwitcher } from "@/components/shell/language-switcher";
import { LoginForm, LoginHeading } from "./login-form";

export const metadata: Metadata = { title: "Kirish — MEDIX" };

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-16">
      <div className="w-full max-w-[400px]">
        <div className="mb-10 flex items-center justify-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-control bg-primary-button text-section-title text-white">
            M
          </span>
          <span className="text-page-title">MEDIX</span>
        </div>
        <div className="rounded-card border border-border bg-surface p-8">
          <LoginHeading />
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
        <LanguageSwitcher className="mx-auto mt-6 w-56" />
      </div>
    </main>
  );
}
