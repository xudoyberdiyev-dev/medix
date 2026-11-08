import { TopBar } from "@/components/shell/topbar";
import { ReceiptDocumentPage } from "@/features/receipts/receipt-drawer";

/** Yangi kirim — toʻliq sahifa (prototip `Receipts` hujjat koʻrinishi). */
export default function Page() {
  return (
    <>
      <TopBar titleKey="receipts" />
      <main className="flex-1 overflow-y-auto p-6">
        <ReceiptDocumentPage id={null} />
      </main>
    </>
  );
}
