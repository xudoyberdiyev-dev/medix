import { notFound } from "next/navigation";
import { TopBar } from "@/components/shell/topbar";
import { ProductFormPage } from "@/features/products/product-form";

/** Mahsulotni tahrirlash — toʻliq sahifa (prototip `Products` → shakl). */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) notFound();
  return (
    <>
      <TopBar titleKey="products" />
      <main className="flex-1 overflow-y-auto p-6">
        <ProductFormPage key={n} id={n} />
      </main>
    </>
  );
}
