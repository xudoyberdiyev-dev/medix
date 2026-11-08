import { TopBar } from "@/components/shell/topbar";
import { ReceiptDocumentPage } from "@/features/receipts/receipt-drawer";

/** Yangi kirim — toʻliq sahifa (prototip `Receipts` hujjat koʻrinishi); `?copy=<id>` — hujjatdan nusxa. */
export default async function Page({ searchParams }: { searchParams: Promise<{ copy?: string }> }) {
  const { copy } = await searchParams;
  const n = Number(copy);
  const copyFrom = Number.isInteger(n) && n > 0 ? n : undefined;
  return (
    <>
      <TopBar titleKey="receipts" />
      <main className="flex-1 overflow-y-auto p-6">
        <ReceiptDocumentPage key={copyFrom ?? "new"} id={null} copyFrom={copyFrom} />
      </main>
    </>
  );
}
