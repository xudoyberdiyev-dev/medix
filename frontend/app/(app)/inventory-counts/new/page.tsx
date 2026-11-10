import { TopBar } from "@/components/shell/topbar";
import { InventoryDocPage } from "@/features/inventory-counts/inventory-doc-page";

/** Yangi inventarizatsiya (prototip `InventoryDoc`) — ombor tanlanganda qoralama avtomatik saqlanadi. */
export default function Page() {
  return (
    <>
      <TopBar titleKey="inventoryCounts" />
      <main className="flex-1 overflow-y-auto p-6">
        <InventoryDocPage id={null} />
      </main>
    </>
  );
}
