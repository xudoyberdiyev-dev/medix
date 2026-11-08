import { notFound } from "next/navigation";
import { TopBar } from "@/components/shell/topbar";
import { ProductCardPage } from "@/features/products/product-card";

/** Mahsulot kartochkasi — toʻliq sahifa (prototip `Products` → kartochka). */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) notFound();
  return (
    <>
      <TopBar titleKey="products" />
      <main className="flex-1 overflow-y-auto p-6">
        <ProductCardPage key={n} id={n} />
      </main>
    </>
  );
}
