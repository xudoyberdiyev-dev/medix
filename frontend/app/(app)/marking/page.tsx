import { TopBar } from "@/components/shell/topbar";
import { MarkingPage } from "@/features/orders/marking-page";

export default function Page() {
  return (
    <>
      <TopBar titleKey="marking" />
      <main data-touch-panel className="flex-1 overflow-y-auto p-4 md:p-6">
        <MarkingPage />
      </main>
    </>
  );
}
