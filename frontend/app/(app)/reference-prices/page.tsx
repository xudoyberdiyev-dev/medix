import { TopBar } from "@/components/shell/topbar";
import { RefListsPage } from "@/features/reference-prices/ref-lists-page";

/** Referent narxlar (O14): yuklangan fayllar tarixi. */
export default function Page() {
  return (
    <>
      <TopBar titleKey="referencePrices" />
      <main className="flex-1 overflow-y-auto p-6">
        <RefListsPage />
      </main>
    </>
  );
}
