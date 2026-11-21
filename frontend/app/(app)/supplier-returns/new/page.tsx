import { Suspense } from "react";
import { TopBar } from "@/components/shell/topbar";
import { NewSupplierReturnPage } from "@/features/supplier-returns/supplier-return-new-page";
import { FreshOnPush } from "@/components/shell/fresh-on-push";

/** QY — yangi YB ga qaytarish (prototip `StockDocs`). */
export default function Page() {
  return (
    <>
      <TopBar titleKey="supplierReturns" />
      <main className="flex-1 overflow-y-auto p-6">
        <FreshOnPush>
          <Suspense>
            <NewSupplierReturnPage />
          </Suspense>
        </FreshOnPush>
      </main>
    </>
  );
}
