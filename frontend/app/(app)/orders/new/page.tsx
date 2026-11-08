import { TopBar } from "@/components/shell/topbar";
import { OrderDocumentPage } from "@/features/orders/order-drawer";

/** Yangi buyurtma — toʻliq sahifa (prototip `OrderEntry`); `?customer=<id>&customerName=…` — mijoz oldindan tanlanadi. */
export default async function Page({ searchParams }: { searchParams: Promise<{ customer?: string; customerName?: string }> }) {
  const sp = await searchParams;
  const c = Number(sp.customer);
  const preset = Number.isInteger(c) && c > 0 ? { customerId: c, customerLabel: sp.customerName ?? "" } : undefined;
  return (
    <>
      <TopBar titleKey="orders" />
      <main className="flex-1 overflow-y-auto p-6">
        <OrderDocumentPage id={null} preset={preset} />
      </main>
    </>
  );
}
