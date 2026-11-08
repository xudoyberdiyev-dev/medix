import { TopBar } from "@/components/shell/topbar";
import { ProductImportWizard } from "@/features/products/import-wizard";

/** Mahsulotlar — Import ustasi (prototip `ImportWizard`, toʻliq sahifa). */
export default function Page() {
  return (
    <>
      <TopBar titleKey="products" />
      <main className="flex-1 overflow-y-auto p-6">
        <ProductImportWizard />
      </main>
    </>
  );
}
