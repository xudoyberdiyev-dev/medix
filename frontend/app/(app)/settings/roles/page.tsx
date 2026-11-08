import { TopBar } from "@/components/shell/topbar";
import { RolesPage } from "@/features/roles/roles-page";

export default function Page() {
  return (
    <>
      <TopBar titleKey="settingsRoles" />
      <main className="flex-1 overflow-y-auto p-6">
        <RolesPage />
      </main>
    </>
  );
}
