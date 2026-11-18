import { Suspense } from "react";
import { TopBar } from "@/components/shell/topbar";
import { ExpectedReceiptsPage } from "@/features/expected-receipts/kk-list-page";

/** KK — kutilayotgan kirimlar (yuk xati), O15. */
export default function Page() {
  return (
    <>
      <TopBar titleKey="expectedReceipts" />
      <main className="flex-1 overflow-y-auto p-6">
        <Suspense>
          <ExpectedReceiptsPage />
        </Suspense>
      </main>
    </>
  );
}
