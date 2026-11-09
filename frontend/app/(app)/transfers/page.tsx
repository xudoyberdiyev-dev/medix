import { Suspense } from "react";
import { TopBar } from "@/components/shell/topbar";
import { TransfersPage } from "@/features/transfers/transfers-page";

export default function Page() {
  return (
    <>
      <TopBar titleKey="transfers" />
      <main className="flex-1 overflow-y-auto p-6">
        <Suspense>
          <TransfersPage />
        </Suspense>
      </main>
    </>
  );
}
