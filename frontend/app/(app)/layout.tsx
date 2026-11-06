import { Sidebar } from "@/components/shell/sidebar";
import { AuthGate } from "@/features/auth/auth-gate";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <AuthGate>
      <div className="flex h-screen print:block print:h-auto">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      </div>
    </AuthGate>
  );
}
