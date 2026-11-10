import { TopBar } from "@/components/shell/topbar";
import { SettingsPage } from "@/features/settings/settings-page";

export default function Page() {
  return (
    <>
      <TopBar titleKey="settings" />
      <main className="flex-1 overflow-y-auto p-6">
        <SettingsPage />
      </main>
    </>
  );
}
