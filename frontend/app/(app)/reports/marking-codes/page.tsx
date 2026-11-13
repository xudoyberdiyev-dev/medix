import { TopBar } from "@/components/shell/topbar";
import { MarkingCodesReportPage } from "@/features/reports/marking-codes-report";

export default function Page() {
  return (
    <>
      <TopBar titleKey="reportsMarkingCodes" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <MarkingCodesReportPage />
      </main>
    </>
  );
}
