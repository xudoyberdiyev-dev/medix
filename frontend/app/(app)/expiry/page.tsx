import { TopBar } from "@/components/shell/topbar";
import { StockPage } from "@/features/stock/stock-page";

export default function Page() {
  return (
    <>
      <TopBar title="Muddat nazorati" />
      <main className="flex-1 overflow-y-auto p-6">
        <StockPage mode="expiry" />
      </main>
    </>
  );
}
