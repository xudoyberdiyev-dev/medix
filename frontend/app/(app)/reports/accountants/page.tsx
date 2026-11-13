import { TopBar } from "@/components/shell/topbar";
import { AccountantReportPage } from "@/features/reports/accountant-report";

export default function Page() {
  return (
    <>
      <TopBar titleKey="reportsAccountants" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <AccountantReportPage />
      </main>
    </>
  );
}
