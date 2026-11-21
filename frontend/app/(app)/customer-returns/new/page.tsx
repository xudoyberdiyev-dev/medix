import { TopBar } from "@/components/shell/topbar";
import { NewCustomerReturnPage } from "@/features/customer-returns/customer-return-new-page";
import { FreshOnPush } from "@/components/shell/fresh-on-push";

/** QM — yangi mijozdan qaytarish (prototip `StockDocs`). */
export default function Page() {
  return (
    <>
      <TopBar titleKey="customerReturns" />
      <main className="flex-1 overflow-y-auto p-6">
        <FreshOnPush>
          <NewCustomerReturnPage />
        </FreshOnPush>
      </main>
    </>
  );
}
