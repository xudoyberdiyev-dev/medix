import type { Metadata } from "next";
import { AuthGate } from "@/features/auth/auth-gate";
import { SetupHeaderLabel } from "@/features/setup/setup-title";

export const metadata: Metadata = { title: "Sozlash ustasi — MEDIX" };

export default function SetupLayout({ children }: LayoutProps<"/setup">) {
  return (
    <AuthGate>
      <div className="min-h-screen bg-background">
        <header className="flex h-topbar items-center gap-3 border-b border-border bg-surface px-6">
          <span className="flex size-8 items-center justify-center rounded-control bg-primary-button font-semibold text-white">M</span>
          <span className="text-subtitle">MEDIX</span>
          <SetupHeaderLabel />
        </header>
        <main className="mx-auto max-w-[1040px] px-6 py-8">{children}</main>
      </div>
    </AuthGate>
  );
}
