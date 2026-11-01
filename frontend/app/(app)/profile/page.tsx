import { TopBar } from "@/components/shell/topbar";
import { ProfilePage } from "@/features/profile/profile-page";

export default function Page() {
  return (
    <>
      <TopBar title="Profil" />
      <main className="flex-1 overflow-y-auto p-6">
        <ProfilePage />
      </main>
    </>
  );
}
