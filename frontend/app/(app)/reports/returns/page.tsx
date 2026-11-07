import { Suspense } from "react";
import { TopBar } from "@/components/shell/topbar";
import { ReturnsReportPage } from "@/features/reports/returns-report";

export default function Page() {
  return (
    <>
      <TopBar titleKey="reportsReturns" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <Suspense>
          <ReturnsReportPage />
        </Suspense>
      </main>
    </>
  );
}
