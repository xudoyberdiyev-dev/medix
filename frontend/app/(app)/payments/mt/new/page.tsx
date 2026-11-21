import { TopBar } from "@/components/shell/topbar";
import { PaymentDocPage } from "@/features/payments/payment-doc-page";
import { FreshOnPush } from "@/components/shell/fresh-on-push";

/** Yangi toʻlov — toʻliq sahifa (prototip `PaymentDoc`). */
export default function Page() {
  return (
    <>
      <TopBar titleKey="payments" />
      <main className="flex-1 overflow-y-auto p-6">
        <FreshOnPush>
          <PaymentDocPage kind="mt" id={null} />
        </FreshOnPush>
      </main>
    </>
  );
}
