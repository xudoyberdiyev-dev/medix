import { TopBar } from "@/components/shell/topbar";
import { ReceiptDocumentPage } from "@/features/receipts/receipt-drawer";

/**
 * Yangi kirim — toʻliq sahifa (prototip `Receipts` hujjat koʻrinishi); `?copy=<id>` — hujjatdan nusxa;
 * `?bonusSupplier=<id>&supplierName=` — YB bonus balansi hisobidan kirim.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ copy?: string; bonusSupplier?: string; supplierName?: string }>;
}) {
  const { copy, bonusSupplier, supplierName } = await searchParams;
  const n = Number(copy);
  const copyFrom = Number.isInteger(n) && n > 0 ? n : undefined;
  const s = Number(bonusSupplier);
  const bonusFor = Number.isInteger(s) && s > 0 && copyFrom === undefined ? { supplierId: s, supplier: supplierName ?? "" } : undefined;
  return (
    <>
      <TopBar titleKey="receipts" />
      <main className="flex-1 overflow-y-auto p-6">
        <ReceiptDocumentPage
          key={copyFrom ?? (bonusFor ? `bonus-${bonusFor.supplierId}` : "new")}
          id={null}
          copyFrom={copyFrom}
          bonusFor={bonusFor}
        />
      </main>
    </>
  );
}
