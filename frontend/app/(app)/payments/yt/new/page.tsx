import { TopBar } from "@/components/shell/topbar";
import { PaymentDocPage } from "@/features/payments/payment-doc-page";

export default function Page() {
  return (
    <>
      <TopBar titleKey="payments" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <PaymentDocPage kind="yt" id={null} />
      </main>
    </>
  );
}
