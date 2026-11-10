import { Suspense } from "react";
import { TopBar } from "@/components/shell/topbar";
import { CashClosePage } from "@/features/cash/close-page";

/** Kassa kunini yopish — toʻliq sahifa (prototip `CashClose`): `?acct=…&date=YYYY-MM-DD`. */
export default function Page() {
  return (
    <>
      <TopBar titleKey="cash" />
      <main className="flex-1 overflow-y-auto p-6">
        <Suspense>
          <CashClosePage />
        </Suspense>
      </main>
    </>
  );
}
