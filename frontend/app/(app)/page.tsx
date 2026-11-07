import { TopBar } from "@/components/shell/topbar";
import { HomeContent } from "@/features/home/home-content";

export default function HomePage() {
  return (
    <>
      <TopBar titleKey="home" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <HomeContent />
      </main>
    </>
  );
}
