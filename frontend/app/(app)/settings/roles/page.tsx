import { TopBar } from "@/components/shell/topbar";
import { RolesPage } from "@/features/roles/roles-page";

export default function Page() {
  return (
    <>
      <TopBar title="Sozlamalar · Rollar va ruxsatlar" />
      <main className="flex-1 overflow-y-auto p-6">
        <RolesPage />
      </main>
    </>
  );
}
