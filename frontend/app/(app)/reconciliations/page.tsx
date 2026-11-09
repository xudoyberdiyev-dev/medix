import { TopBar } from "@/components/shell/topbar";
import { ReconListPage } from "@/features/reconciliations/recon-pages";

export default function Page() {
  return (
    <>
      <TopBar titleKey="reconciliations" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <ReconListPage />
      </main>
    </>
  );
}
