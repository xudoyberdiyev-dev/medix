import { Suspense } from "react";
import { TopBar } from "@/components/shell/topbar";
import { ExpenseReportPage } from "@/features/reports/expense-report";

export default function Page() {
  return (
    <>
      <TopBar titleKey="reportsExpenses" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <Suspense>
          <ExpenseReportPage />
        </Suspense>
      </main>
    </>
  );
}
