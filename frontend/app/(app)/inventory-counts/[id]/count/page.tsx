import { notFound } from "next/navigation";
import { TopBar } from "@/components/shell/topbar";
import { InventoryCountScreen } from "@/features/inventory-counts/inventory-count-screen";

/** Inventarizatsiya sanoq ekrani (prototip `InventoryCount`, planshet uchun). */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) notFound();
  return (
    <>
      <TopBar titleKey="inventoryCounts" />
      <main className="flex-1 overflow-y-auto p-6">
        <InventoryCountScreen key={n} id={n} />
      </main>
    </>
  );
}
