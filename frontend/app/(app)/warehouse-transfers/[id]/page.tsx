import { notFound } from "next/navigation";
import { TopBar } from "@/components/shell/topbar";
import { WarehouseTransferDocPage } from "@/features/warehouse-transfers/transfer-doc-page";

/** OK — ombor koʻchirish hujjati (prototip `TransferDoc`). */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) notFound();
  return (
    <>
      <TopBar titleKey="transfers" />
      <main className="flex-1 overflow-y-auto p-6">
        <WarehouseTransferDocPage key={n} id={n} />
      </main>
    </>
  );
}
