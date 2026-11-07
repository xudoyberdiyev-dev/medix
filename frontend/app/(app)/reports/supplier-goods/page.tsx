import { TopBar } from "@/components/shell/topbar";
import { SupplierGoodsReportPage } from "@/features/reports/supplier-goods-report";

export default function Page() {
  return (
    <>
      <TopBar titleKey="reportsSupplierGoods" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <SupplierGoodsReportPage />
      </main>
    </>
  );
}
