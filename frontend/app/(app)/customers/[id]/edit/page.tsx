import { notFound } from "next/navigation";
import { TopBar } from "@/components/shell/topbar";
import { CounterpartyFormPage } from "@/features/counterparties/counterparty-form";

/** Kontragent kartasini tahrirlash — toʻliq sahifa (prototip `CounterpartyForm`, mode=edit). */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) notFound();
  return (
    <>
      <TopBar titleKey="customers" />
      <main className="flex-1 overflow-y-auto p-6">
        <CounterpartyFormPage key={n} role="CUSTOMER" id={n} />
      </main>
    </>
  );
}
