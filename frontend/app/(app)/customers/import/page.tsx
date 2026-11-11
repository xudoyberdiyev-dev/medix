import { TopBar } from "@/components/shell/topbar";
import { CounterpartyImportWizard } from "@/features/counterparties/import-wizard";

/** Excelʼdan yuklash — Import ustasi (prototip `ImportWizard`, toʻliq sahifa). */
export default function Page() {
  return (
    <>
      <TopBar titleKey="customers" />
      <main className="flex-1 overflow-y-auto p-6">
        <CounterpartyImportWizard role="CUSTOMER" />
      </main>
    </>
  );
}
