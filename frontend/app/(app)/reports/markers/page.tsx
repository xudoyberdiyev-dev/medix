import { TopBar } from "@/components/shell/topbar";
import { WorkerReportPage } from "@/features/reports/worker-report";

export default function Page() {
  return (
    <>
      <TopBar titleKey="reportsMarkers" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <WorkerReportPage kind="MARKERS" />
      </main>
    </>
  );
}
