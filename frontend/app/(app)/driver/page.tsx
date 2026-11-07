import { TopBar } from "@/components/shell/topbar";
import { DriverPage } from "@/features/orders/driver-page";

export default function Page() {
  return (
    <>
      <TopBar titleKey="driver" />
      <main data-touch-panel className="flex-1 overflow-y-auto p-4 md:p-6">
        <DriverPage />
      </main>
    </>
  );
}
