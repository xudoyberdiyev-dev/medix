import { Suspense } from "react";
import { TopBar } from "@/components/shell/topbar";
import { CashPage } from "@/features/payments/cash-page";

export default function Page() {
  return (
    <>
      <TopBar titleKey="cash" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <Suspense>
          <CashPage />
        </Suspense>
      </main>
    </>
  );
}
