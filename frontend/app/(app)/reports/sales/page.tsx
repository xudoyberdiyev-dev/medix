import { TopBar } from "@/components/shell/topbar";
import { SalesReportPage } from "@/features/reports/sales-report";

export default function Page() {
  return (
    <>
      <TopBar title="Savdo hisoboti" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <SalesReportPage />
      </main>
    </>
  );
}
