import { Suspense } from "react";
import { TopBar } from "@/components/shell/topbar";
import { OrdersPage } from "@/features/orders/orders-page";

export default function Page() {
  return (
    <>
      <TopBar title="Buyurtmalar" />
      <main className="flex-1 overflow-y-auto p-6">
        <Suspense>
          <OrdersPage />
        </Suspense>
      </main>
    </>
  );
}
