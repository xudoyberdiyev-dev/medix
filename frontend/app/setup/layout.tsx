import type { Metadata } from "next";
import { AuthGate } from "@/features/auth/auth-gate";

export const metadata: Metadata = { title: "Sozlash ustasi — MEDIX" };

/** Sozlash ustasi oʻz qobigʻida (prototip SetupWizard): sarlavha va qadamlar `WizardFrame` da. */
export default function SetupLayout({ children }: LayoutProps<"/setup">) {
  return <AuthGate>{children}</AuthGate>;
}
