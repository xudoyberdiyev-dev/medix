import { PageHeading, TopBar } from "@/components/shell/topbar";
import { SettingsSections } from "@/features/organization/settings-sections";

export default function SettingsPage() {
  return (
    <>
      <TopBar titleKey="settings" />
      <main className="flex-1 overflow-y-auto p-6">
        <PageHeading titleKey="settings" className="mb-6 text-page-title" />
        <SettingsSections />
      </main>
    </>
  );
}
