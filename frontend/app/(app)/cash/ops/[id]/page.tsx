import { notFound } from "next/navigation";
import { TopBar } from "@/components/shell/topbar";
import { MoneyOpView } from "@/features/cash/money-op-view";

/** KO / BO — koʻrish sahifasi (prototip `MoneyOpDoc`). */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) notFound();
  return (
    <>
      <TopBar titleKey="cash" />
      <main className="flex-1 overflow-y-auto p-6">
        <MoneyOpView key={n} id={n} />
      </main>
    </>
  );
}
