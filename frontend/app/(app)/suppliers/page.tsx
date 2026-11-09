import { Suspense } from "react";
import { TopBar } from "@/components/shell/topbar";
import { OverviewPage } from "@/features/counterparties/overview-page";

export default function Page() {
  return (
    <>
      <TopBar titleKey="suppliers" />
      <main className="flex-1 overflow-y-auto p-6">
        <Suspense>
          <OverviewPage role="SUPPLIER" />
        </Suspense>
      </main>
    </>
  );
}
