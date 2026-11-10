import { notFound } from "next/navigation";
import { TopBar } from "@/components/shell/topbar";
import { BranchSaleDocPage } from "@/features/branch-sales/branch-sale-doc-page";

/** FS — filiallararo savdo hujjati (prototip `TransferDoc`). */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) notFound();
  return (
    <>
      <TopBar titleKey="branchSales" />
      <main className="flex-1 overflow-y-auto p-6">
        <BranchSaleDocPage key={n} id={n} />
      </main>
    </>
  );
}
