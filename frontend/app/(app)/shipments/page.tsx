import { TopBar } from "@/components/shell/topbar";
import { ShipmentsPage } from "@/features/orders/shipments-page";

export default function Page() {
  return (
    <>
      <TopBar titleKey="shipments" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <ShipmentsPage />
      </main>
    </>
  );
}
