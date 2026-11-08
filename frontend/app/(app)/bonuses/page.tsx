import { TopBar } from "@/components/shell/topbar";
import { BonusPage } from "@/features/bonuses/bonus-page";

export default function Page() {
  return (
    <>
      <TopBar titleKey="bonuses" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <BonusPage />
      </main>
    </>
  );
}
