import { Suspense } from "react";
import { TopBar } from "@/components/shell/topbar";
import { CounterpartiesPage } from "@/features/counterparties/counterparties-page";

export default function Page() {
  return (
    <>
      <TopBar titleKey="suppliers" />
      <main className="flex-1 overflow-y-auto p-6">
        <Suspense>
          <CounterpartiesPage role="SUPPLIER" />
        </Suspense>
      </main>
    </>
  );
}
