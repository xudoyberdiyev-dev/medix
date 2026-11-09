import { Suspense } from "react";
import { TopBar } from "@/components/shell/topbar";
import { PriceSetPage } from "@/features/prices/price-set-page";

/** «Narx oʻrnatish» — toʻliq sahifa (prototip `Prices` → set); `?type=<id>&branch=<id>`. */
export default function Page() {
  return (
    <>
      <TopBar titleKey="prices" />
      <main className="flex-1 overflow-y-auto p-6">
        <Suspense>
          <PriceSetPage />
        </Suspense>
      </main>
    </>
  );
}
