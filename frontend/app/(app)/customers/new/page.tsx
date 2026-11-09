import { TopBar } from "@/components/shell/topbar";
import { CounterpartyFormPage } from "@/features/counterparties/counterparty-form";

/** Yangi kontragent — toʻliq sahifa (prototip `CounterpartyForm`). */
export default function Page() {
  return (
    <>
      <TopBar titleKey="customers" />
      <main className="flex-1 overflow-y-auto p-6">
        <CounterpartyFormPage role="CUSTOMER" />
      </main>
    </>
  );
}
