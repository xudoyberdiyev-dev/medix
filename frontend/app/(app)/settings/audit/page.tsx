import { TopBar } from "@/components/shell/topbar";
import { AuditPage } from "@/features/audit/audit-page";

export default function Page() {
  return (
    <>
      <TopBar title="Sozlamalar · Audit jurnali" />
      <main className="flex-1 overflow-y-auto p-6">
        <AuditPage />
      </main>
    </>
  );
}
