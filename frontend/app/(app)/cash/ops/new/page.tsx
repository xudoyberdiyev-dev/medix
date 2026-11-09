import { Suspense } from "react";
import { TopBar } from "@/components/shell/topbar";
import { MoneyOpPage } from "@/features/cash/money-op-page";

/** Yangi KO / BO / IO — toʻliq sahifa (prototip `MoneyOpDoc`): `?kind=ko|bo|io&dir=IN|OUT&acct=…`. */
export default function Page() {
  return (
    <>
      <TopBar titleKey="cash" />
      <main className="flex-1 overflow-y-auto p-6">
        <Suspense>
          <MoneyOpPage />
        </Suspense>
      </main>
    </>
  );
}
