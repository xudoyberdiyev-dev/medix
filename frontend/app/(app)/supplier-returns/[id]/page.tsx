import { notFound } from "next/navigation";
import { TopBar } from "@/components/shell/topbar";
import { SupplierReturnDocPage } from "@/features/supplier-returns/supplier-return-doc-page";

/** QY — yetkazib beruvchiga qaytarish hujjati (prototip `StockDocs`). */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) notFound();
  return (
    <>
      <TopBar titleKey="supplierReturns" />
      <main className="flex-1 overflow-y-auto p-6">
        <SupplierReturnDocPage key={n} id={n} />
      </main>
    </>
  );
}
