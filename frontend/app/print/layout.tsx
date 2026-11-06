import { AuthGate } from "@/features/auth/auth-gate";

/** Chop etish shakllari: sidebar va yuqori panelsiz, oq fonda (A4). */
export default function PrintLayout({ children }: LayoutProps<"/print">) {
  return (
    <AuthGate>
      <div className="min-h-screen bg-surface text-text-primary">{children}</div>
    </AuthGate>
  );
}
