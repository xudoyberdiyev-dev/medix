import { Suspense } from "react";
import { TopBar } from "@/components/shell/topbar";
import { WarehouseTransfersPage } from "@/features/warehouse-transfers/warehouse-transfers-page";

export default function Page() {
  return (
    <>
      <TopBar title="Ombor koʻchirishlari" />
      <main className="flex-1 overflow-y-auto p-6">
        <Suspense>
          <WarehouseTransfersPage />
        </Suspense>
      </main>
    </>
  );
}
