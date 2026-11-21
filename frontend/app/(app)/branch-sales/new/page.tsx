import { TopBar } from "@/components/shell/topbar";
import { NewWarehouseTransferPage } from "@/features/warehouse-transfers/transfer-doc-page";
import { FreshOnPush } from "@/components/shell/fresh-on-push";

/** FS — yangi filiallararo savdo qoralamasi (prototip `TransferDoc`, kind = fs). */
export default function Page() {
  return (
    <>
      <TopBar titleKey="branchSales" />
      <main className="flex-1 overflow-y-auto p-6">
        <FreshOnPush>
          <NewWarehouseTransferPage kind="FS" />
        </FreshOnPush>
      </main>
    </>
  );
}
