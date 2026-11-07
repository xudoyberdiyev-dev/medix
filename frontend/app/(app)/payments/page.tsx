import { TopBar } from "@/components/shell/topbar";
import { PaymentsPage } from "@/features/payments/payments-page";

export default function Page() {
  return (
    <>
      <TopBar titleKey="payments" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <PaymentsPage />
      </main>
    </>
  );
}
