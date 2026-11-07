import { Suspense } from "react";
import { TopBar } from "@/components/shell/topbar";
import { SalesReportPage } from "@/features/reports/sales-report";

export default function Page() {
  return (
    <>
      <TopBar titleKey="reportsSales" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <Suspense>
          <SalesReportPage />
        </Suspense>
      </main>
    </>
  );
}
