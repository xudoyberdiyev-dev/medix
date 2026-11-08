import { TopBar } from "@/components/shell/topbar";
import { ProductFormPage } from "@/features/products/product-form";

/** Yangi mahsulot — toʻliq sahifa (prototip `Products` → shakl); `?copy=<id>` — «Nusxa olish». */
export default async function Page({ searchParams }: { searchParams: Promise<{ copy?: string }> }) {
  const sp = await searchParams;
  const c = Number(sp.copy);
  const copy = Number.isInteger(c) && c > 0 ? c : null;
  return (
    <>
      <TopBar titleKey="products" />
      <main className="flex-1 overflow-y-auto p-6">
        <ProductFormPage key={copy ?? "new"} copyFrom={copy} />
      </main>
    </>
  );
}
