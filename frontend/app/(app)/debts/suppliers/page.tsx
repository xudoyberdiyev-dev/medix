import { TopBar } from "@/components/shell/topbar";
import { PayablesPage } from "@/features/debts/payables";

export default function Page() {
  return (
    <>
      <TopBar titleKey="debtsSuppliers" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <PayablesPage />
      </main>
    </>
  );
}
