import { notFound } from "next/navigation";
import { Suspense } from "react";
import { TopBar } from "@/components/shell/topbar";
import { CounterpartyCardPage } from "@/features/counterparties/counterparty-card";

/** Kontragent kartochkasi — toʻliq sahifa (prototip `CounterpartyCard`). */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) notFound();
  return (
    <>
      <TopBar titleKey="suppliers" />
      <main className="flex-1 overflow-y-auto p-6">
        <Suspense>
          <CounterpartyCardPage key={n} id={n} role="SUPPLIER" />
        </Suspense>
      </main>
    </>
  );
}
