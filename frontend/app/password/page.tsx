import type { Metadata } from "next";
import { AuthShell } from "@/features/auth/auth-shell";
import { PasswordExit, PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Yangi parol — MEDIX" };

export default function PasswordPage() {
  return (
    <AuthShell topRight={<PasswordExit />}>
      <PasswordForm />
    </AuthShell>
  );
}
