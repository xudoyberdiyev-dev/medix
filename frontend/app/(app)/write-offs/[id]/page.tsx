import { notFound } from "next/navigation";
import { TopBar } from "@/components/shell/topbar";
import { WriteOffDocPage } from "@/features/write-offs/write-off-doc-page";

/** HC — hisobdan chiqarish hujjati (prototip `StockDocs`). */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) notFound();
  return (
    <>
      <TopBar titleKey="writeOffs" />
      <main className="flex-1 overflow-y-auto p-6">
        <WriteOffDocPage key={n} id={n} />
      </main>
    </>
  );
}
