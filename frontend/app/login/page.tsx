import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginLayout } from "@/features/auth/login-layout";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Kirish — 100+" };

export default function LoginPage() {
  return (
    <LoginLayout>
      <Suspense>
        <LoginForm />
      </Suspense>
    </LoginLayout>
  );
}
