import { notFound } from "next/navigation";
import { TopBar } from "@/components/shell/topbar";
import { PaymentDocPage } from "@/features/payments/payment-doc-page";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) notFound();
  return (
    <>
      <TopBar titleKey="payments" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <PaymentDocPage key={n} kind="mt" id={n} />
      </main>
    </>
  );
}
