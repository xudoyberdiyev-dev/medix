import { notFound } from "next/navigation";
import { TopBar } from "@/components/shell/topbar";
import { OpeningDocPage } from "@/features/opening/opening-drawer";

/** BQ (tovar) hujjati (prototip `OpeningDoc`). */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) notFound();
  return (
    <>
      <TopBar titleKey="opening" />
      <main className="flex-1 overflow-y-auto p-6">
        <OpeningDocPage key={n} id={n} />
      </main>
    </>
  );
}
