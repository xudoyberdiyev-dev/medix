import { TopBar } from "@/components/shell/topbar";
import { SettingsSections } from "@/features/organization/settings-sections";

export default function SettingsPage() {
  return (
    <>
      <TopBar title="Sozlamalar" />
      <main className="flex-1 overflow-y-auto p-6">
        <h1 className="mb-6 text-page-title">Sozlamalar</h1>
        <SettingsSections />
      </main>
    </>
  );
}
