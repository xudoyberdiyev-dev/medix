import { notFound } from "next/navigation";
import { TopBar } from "@/components/shell/topbar";
import { AdvanceViewPage } from "@/features/debts/advance-doc-page";

/** «Avansni hisobga olish» hujjati (prototip `AdvanceDoc`). */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) notFound();
  return (
    <>
      <TopBar titleKey="debtsCustomers" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <AdvanceViewPage key={n} id={n} />
      </main>
    </>
  );
}
