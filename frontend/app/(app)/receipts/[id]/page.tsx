import { notFound } from "next/navigation";
import { TopBar } from "@/components/shell/topbar";
import { ReceiptDocumentPage } from "@/features/receipts/receipt-drawer";

/** Kirim hujjati — toʻliq sahifa (prototip `Receipts`: Hujjat / Tarix). */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) notFound();
  return (
    <>
      <TopBar titleKey="receipts" />
      <main className="flex-1 overflow-y-auto p-6">
        <ReceiptDocumentPage key={n} id={n} />
      </main>
    </>
  );
}
