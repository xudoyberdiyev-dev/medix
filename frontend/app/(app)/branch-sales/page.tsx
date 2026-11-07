import { Suspense } from "react";
import { TopBar } from "@/components/shell/topbar";
import { BranchSalesPage } from "@/features/branch-sales/branch-sales-page";

export default function Page() {
  return (
    <>
      <TopBar titleKey="branchSales" />
      <main className="flex-1 overflow-y-auto p-6">
        <Suspense>
          <BranchSalesPage />
        </Suspense>
      </main>
    </>
  );
}
