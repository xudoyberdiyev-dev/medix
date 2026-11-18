import { OfflineBanner } from "@/components/shell/offline-banner";
import { Sidebar } from "@/components/shell/sidebar";
import { AuthGate } from "@/features/auth/auth-gate";
import { ThemeSync } from "@/features/profile/theme-sync";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <AuthGate>
      <div className="relative flex h-dvh overflow-hidden print:block print:h-auto print:overflow-visible">
        <ThemeSync />
        <Sidebar />
        <div data-app-content className="flex min-w-0 flex-1 flex-col">
          <OfflineBanner />
          {children}
        </div>
      </div>
    </AuthGate>
  );
}
