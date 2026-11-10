import { notFound } from "next/navigation";
import { TopBar } from "@/components/shell/topbar";
import { WarehouseTransferReceivePage } from "@/features/warehouse-transfers/receive-page";

/** OK qabul qilish (prototip `TransferReceive`). */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) notFound();
  return (
    <>
      <TopBar titleKey="transfers" />
      <main className="flex-1 overflow-y-auto p-6">
        <WarehouseTransferReceivePage key={n} id={n} />
      </main>
    </>
  );
}
