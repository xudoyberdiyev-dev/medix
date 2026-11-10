import { TopBar } from "@/components/shell/topbar";
import { NewWarehouseTransferPage } from "@/features/warehouse-transfers/transfer-doc-page";

/** FS — yangi filiallararo savdo qoralamasi (prototip `TransferDoc`, kind = fs). */
export default function Page() {
  return (
    <>
      <TopBar titleKey="branchSales" />
      <main className="flex-1 overflow-y-auto p-6">
        <NewWarehouseTransferPage kind="FS" />
      </main>
    </>
  );
}
