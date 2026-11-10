import { Suspense } from "react";
import { TopBar } from "@/components/shell/topbar";
import { CustomerReturnsPage } from "@/features/customer-returns/customer-returns-page";

export default function Page() {
  return (
    <>
      <TopBar titleKey="customerReturns" />
      <main className="flex-1 overflow-y-auto p-6">
        <Suspense>
          <CustomerReturnsPage />
        </Suspense>
      </main>
    </>
  );
}
