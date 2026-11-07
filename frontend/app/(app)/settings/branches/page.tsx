import { TopBar } from "@/components/shell/topbar";
import { BranchesPage } from "@/features/organization/branches-page";

export default function Page() {
  return (
    <>
      <TopBar titleKey="settingsBranches" />
      <main className="flex-1 overflow-y-auto p-6">
        <BranchesPage />
      </main>
    </>
  );
}
