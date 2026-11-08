import { notFound } from "next/navigation";
import { TopBar } from "@/components/shell/topbar";
import { OrderDocumentPage } from "@/features/orders/order-drawer";

/** Buyurtma hujjati — toʻliq sahifa (prototip `OrderCard` / qoralamada `OrderEntry`). */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) notFound();
  return (
    <>
      <TopBar titleKey="orders" />
      <main className="flex-1 overflow-y-auto p-6">
        <OrderDocumentPage key={n} id={n} />
      </main>
    </>
  );
}
