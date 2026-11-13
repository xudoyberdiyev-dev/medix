import { TopBar } from "@/components/shell/topbar";
import { SalesZonesPage } from "@/features/sales-zones/sales-zones-page";

export default function Page() {
  return (
    <>
      <TopBar titleKey="salesZones" />
      <main className="flex-1 overflow-y-auto p-6">
        <SalesZonesPage />
      </main>
    </>
  );
}
