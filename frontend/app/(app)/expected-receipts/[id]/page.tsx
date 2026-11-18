import { notFound } from "next/navigation";
import { TopBar } from "@/components/shell/topbar";
import { KkDocPage } from "@/features/expected-receipts/kk-doc-page";

/** KK — kutilayotgan kirim hujjati. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) notFound();
  return (
    <>
      <TopBar titleKey="expectedReceipts" />
      <main className="flex-1 overflow-y-auto p-6">
        <KkDocPage key={n} id={n} />
      </main>
    </>
  );
}
