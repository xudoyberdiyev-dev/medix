import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell, LocaleSegments } from "@/features/auth/auth-shell";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Kirish — MEDIX" };

export default function LoginPage() {
  return (
    <AuthShell topRight={<LocaleSegments />}>
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
