import { TopBar } from "@/components/shell/topbar";
import { OpeningPage } from "@/features/opening/opening-page";

export default function Page() {
  return (
    <>
      <TopBar title="Boshlangʻich qoldiq" />
      <main className="flex-1 overflow-y-auto p-6">
        <OpeningPage />
      </main>
    </>
  );
}
