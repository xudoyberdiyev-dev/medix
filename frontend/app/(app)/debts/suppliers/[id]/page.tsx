import { TopBar } from "@/components/shell/topbar";
import { DebtCardPage } from "@/features/debts/debt-card";

export default async function Page(props: { params: Promise<{ id: string }>; searchParams: Promise<{ name?: string }> }) {
  const { id } = await props.params;
  const { name } = await props.searchParams;
  return (
    <>
      <TopBar titleKey="debtsSuppliers" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <DebtCardPage side="SUPPLIER" id={Number(id)} name={name ?? null} />
      </main>
    </>
  );
}
