import { TopBar } from "@/components/shell/topbar";
import { PaymentDocPage } from "@/features/payments/payment-doc-page";

/** Yangi toʻlov — toʻliq sahifa (prototip `PaymentDoc`). */
export default function Page() {
  return (
    <>
      <TopBar titleKey="payments" />
      <main className="flex-1 overflow-y-auto p-6">
        <PaymentDocPage kind="mt" id={null} />
      </main>
    </>
  );
}
