import { Suspense } from "react";
import { TopBar } from "@/components/shell/topbar";
import { ReferencePricesPage } from "@/features/reference-prices/reference-prices-page";

export default function Page() {
  return (
    <>
      <TopBar titleKey="referencePrices" />
      <main className="flex-1 overflow-y-auto p-6">
        <Suspense>
          <ReferencePricesPage />
        </Suspense>
      </main>
    </>
  );
}
