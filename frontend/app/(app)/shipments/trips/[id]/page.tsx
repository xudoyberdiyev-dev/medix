import { notFound } from "next/navigation";
import { TopBar } from "@/components/shell/topbar";
import { TripPage } from "@/features/orders/trip-page";

/** Reys sahifasi (prototip `TripPage`). */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) notFound();
  return (
    <>
      <TopBar titleKey="shipments" />
      <main className="flex-1 overflow-y-auto p-6">
        <TripPage key={n} id={n} />
      </main>
    </>
  );
}
