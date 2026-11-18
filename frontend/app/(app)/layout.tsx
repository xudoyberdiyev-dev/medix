import { Sidebar } from "@/components/shell/sidebar";
import { AuthGate } from "@/features/auth/auth-gate";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <AuthGate>
      <div className="flex h-dvh overflow-hidden print:block print:h-auto print:overflow-visible">
        <Sidebar />
        <div data-app-content className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden print:overflow-visible">
          {children}
        </div>
      </div>
    </AuthGate>
  );
}
