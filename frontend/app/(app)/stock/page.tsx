import { TopBar } from "@/components/shell/topbar";
import { StockOverview } from "@/features/stock/stock-overview";

export default function Page() {
  return (
    <>
      <TopBar titleKey="stock" />
      <main className="flex-1 overflow-y-auto p-6">
        <StockOverview />
      </main>
    </>
  );
}
