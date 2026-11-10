import { TopBar } from "@/components/shell/topbar";
import { NewWarehouseTransferPage } from "@/features/warehouse-transfers/transfer-doc-page";

/** OK — yangi qoralama (prototip `TransferDoc`). */
export default function Page() {
  return (
    <>
      <TopBar titleKey="transfers" />
      <main className="flex-1 overflow-y-auto p-6">
        <NewWarehouseTransferPage />
      </main>
    </>
  );
}
