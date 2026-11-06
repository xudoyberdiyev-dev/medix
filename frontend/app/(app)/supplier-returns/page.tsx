import { Suspense } from "react";
import { TopBar } from "@/components/shell/topbar";
import { SupplierReturnsPage } from "@/features/supplier-returns/supplier-returns-page";

export default function Page() {
  return (
    <>
      <TopBar title="YB ga qaytarish" />
      <main className="flex-1 overflow-y-auto p-6">
        <Suspense>
          <SupplierReturnsPage />
        </Suspense>
      </main>
    </>
  );
}
