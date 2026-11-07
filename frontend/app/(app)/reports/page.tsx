import { TopBar } from "@/components/shell/topbar";
import { ReportsCatalog } from "@/features/reports/catalog";

export default function Page() {
  return (
    <>
      <TopBar titleKey="reports" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <ReportsCatalog />
      </main>
    </>
  );
}
