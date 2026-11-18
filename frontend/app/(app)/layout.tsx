import { Sidebar } from "@/components/shell/sidebar";
import { AuthGate } from "@/features/auth/auth-gate";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <AuthGate>
      <div className="relative flex h-dvh overflow-hidden print:block print:h-auto print:overflow-visible">
        <Sidebar />
        <div data-app-content className="flex min-w-0 flex-1 flex-col">
          {children}
        </div>
      </div>
    </AuthGate>
  );
}
