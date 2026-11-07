import { TopBar } from "@/components/shell/topbar";
import { DebtsPage } from "@/features/debts/debts-page";

export default function Page() {
  return (
    <>
      <TopBar titleKey="debtsCustomers" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <DebtsPage side="CUSTOMER" />
      </main>
    </>
  );
}
