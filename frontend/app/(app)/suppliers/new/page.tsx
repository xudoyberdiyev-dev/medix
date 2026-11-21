import { TopBar } from "@/components/shell/topbar";
import { CounterpartyFormPage } from "@/features/counterparties/counterparty-form";
import { FreshOnPush } from "@/components/shell/fresh-on-push";

/** Yangi kontragent — toʻliq sahifa (prototip `CounterpartyForm`). */
export default function Page() {
  return (
    <>
      <TopBar titleKey="suppliers" />
      <main className="flex-1 overflow-y-auto p-6">
        <FreshOnPush>
          <CounterpartyFormPage role="SUPPLIER" />
        </FreshOnPush>
      </main>
    </>
  );
}
