import { notFound } from "next/navigation";
import { TopBar } from "@/components/shell/topbar";
import { CustomerReturnDocPage } from "@/features/customer-returns/customer-return-drawer";

/** QM — mijozdan qaytarish hujjati (prototip `StockDocs`). */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) notFound();
  return (
    <>
      <TopBar titleKey="customerReturns" />
      <main className="flex-1 overflow-y-auto p-6">
        <CustomerReturnDocPage key={n} id={n} />
      </main>
    </>
  );
}
