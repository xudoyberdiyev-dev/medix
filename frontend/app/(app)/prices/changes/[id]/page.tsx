import { notFound } from "next/navigation";
import { TopBar } from "@/components/shell/topbar";
import { PriceChangeDocumentPage } from "@/features/prices/price-change-document";

/** NO hujjati — toʻliq sahifa (prototip `Prices` → «NO hujjati»). */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) notFound();
  return (
    <>
      <TopBar titleKey="prices" />
      <main className="flex-1 overflow-y-auto p-6">
        <PriceChangeDocumentPage key={n} id={n} />
      </main>
    </>
  );
}
