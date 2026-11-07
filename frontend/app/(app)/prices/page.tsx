import { Suspense } from "react";
import { TopBar } from "@/components/shell/topbar";
import { PricesPage } from "@/features/prices/prices-page";

export default function Page() {
  return (
    <>
      <TopBar titleKey="prices" />
      <main className="flex-1 overflow-y-auto p-6">
        <Suspense>
          <PricesPage />
        </Suspense>
      </main>
    </>
  );
}
