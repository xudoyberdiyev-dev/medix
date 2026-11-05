import { TopBar } from "@/components/shell/topbar";
import { MonitorPage } from "@/features/orders/monitor-page";

export default function Page() {
  return (
    <>
      <TopBar title="Ombor mudiri paneli" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <MonitorPage />
      </main>
    </>
  );
}
