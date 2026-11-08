import { TopBar } from "@/components/shell/topbar";
import { ExpiryControl } from "@/features/stock/expiry-control";

export default function Page() {
  return (
    <>
      <TopBar titleKey="expiry" />
      <main className="flex-1 overflow-y-auto p-6">
        <ExpiryControl />
      </main>
    </>
  );
}
