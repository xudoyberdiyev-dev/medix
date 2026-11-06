import { TopBar } from "@/components/shell/topbar";
import { PickingPage } from "@/features/orders/picking-page";

export default function Page() {
  return (
    <>
      <TopBar title="Yigʻish" />
      <main data-touch-panel className="flex-1 overflow-y-auto p-6">
        <PickingPage />
      </main>
    </>
  );
}
