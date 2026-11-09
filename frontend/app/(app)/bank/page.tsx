import { TopBar } from "@/components/shell/topbar";
import { BankPage } from "@/features/bank/bank-page";

export default function Page() {
  return (
    <>
      <TopBar titleKey="bank" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <BankPage />
      </main>
    </>
  );
}
