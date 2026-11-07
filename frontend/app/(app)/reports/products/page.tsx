import { Suspense } from "react";
import { TopBar } from "@/components/shell/topbar";
import { ProductSalesReportPage } from "@/features/reports/product-sales-report";

export default function Page() {
  return (
    <>
      <TopBar titleKey="reportsProducts" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <Suspense>
          <ProductSalesReportPage />
        </Suspense>
      </main>
    </>
  );
}
