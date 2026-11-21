import { TopBar } from "@/components/shell/topbar";
import { ReconNewPage } from "@/features/reconciliations/recon-pages";
import { FreshOnPush } from "@/components/shell/fresh-on-push";

export default function Page() {
  return (
    <>
      <TopBar titleKey="reconciliations" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <FreshOnPush>
          <ReconNewPage />
        </FreshOnPush>
      </main>
    </>
  );
}
