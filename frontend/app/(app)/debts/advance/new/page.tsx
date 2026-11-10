import { notFound } from "next/navigation";
import { TopBar } from "@/components/shell/topbar";
import { AdvanceNewPage } from "@/features/debts/advance-doc-page";

/** Yangi «Avansni hisobga olish» (prototip `AdvanceDoc`): `?side=CUSTOMER|SUPPLIER&party=…&branch=…`. */
export default async function Page(props: { searchParams: Promise<{ side?: string; party?: string; branch?: string }> }) {
  const sp = await props.searchParams;
  const side = sp.side === "SUPPLIER" ? "SUPPLIER" : sp.side === "CUSTOMER" ? "CUSTOMER" : null;
  const party = Number(sp.party);
  const branch = Number(sp.branch);
  if (!side || !Number.isInteger(party) || party <= 0 || !Number.isInteger(branch) || branch <= 0) notFound();
  return (
    <>
      <TopBar titleKey={side === "CUSTOMER" ? "debtsCustomers" : "debtsSuppliers"} />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <AdvanceNewPage key={`${side}-${party}-${branch}`} side={side} party={party} branch={branch} />
      </main>
    </>
  );
}
