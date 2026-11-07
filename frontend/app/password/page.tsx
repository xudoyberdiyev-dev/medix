import type { Metadata } from "next";
import { PasswordForm } from "./password-form";
import { PasswordIntro } from "./password-intro";

export const metadata: Metadata = { title: "Parolni almashtirish — MEDIX" };

export default function PasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-16">
      <div className="w-full max-w-[400px] rounded-card border border-border bg-surface p-8">
        <PasswordIntro />
        <PasswordForm />
      </div>
    </main>
  );
}
