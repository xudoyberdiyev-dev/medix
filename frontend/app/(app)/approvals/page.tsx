import { TopBar } from "@/components/shell/topbar";
import { ApprovalsPage } from "@/features/approvals/approvals-page";

export default function Page() {
  return (
    <>
      <TopBar titleKey="approvals" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <ApprovalsPage />
      </main>
    </>
  );
}
