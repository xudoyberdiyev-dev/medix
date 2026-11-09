import { TopBar } from "@/components/shell/topbar";
import { ReconViewPage } from "@/features/reconciliations/recon-pages";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <TopBar titleKey="reconciliations" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <ReconViewPage id={Number(id)} />
      </main>
    </>
  );
}
