import { TopBar } from "@/components/shell/topbar";
import { RefUploadPage } from "@/features/reference-prices/ref-upload-page";

/** Referent narxlar fayli — yuklash va ustunlarni moslash (O14). */
export default function Page() {
  return (
    <>
      <TopBar titleKey="referencePrices" />
      <main className="flex-1 overflow-y-auto p-6">
        <RefUploadPage />
      </main>
    </>
  );
}
