import { Suspense } from "react";
import { TopBar } from "@/components/shell/topbar";
import { InventoryCountsPage } from "@/features/inventory-counts/inventory-counts-page";

export default function Page() {
  return (
    <>
      <TopBar titleKey="inventoryCounts" />
      <main className="flex-1 overflow-y-auto p-6">
        <Suspense>
          <InventoryCountsPage />
        </Suspense>
      </main>
    </>
  );
}
