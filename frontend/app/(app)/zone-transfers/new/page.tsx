import { TopBar } from "@/components/shell/topbar";
import { NewZoneTransferPage } from "@/features/zone-transfers/zk-new-page";

/** ZK — yangi zona koʻchirishi (prototip `TransferDoc`). */
export default function Page() {
  return (
    <>
      <TopBar titleKey="transfers" />
      <main className="flex-1 overflow-y-auto p-6">
        <NewZoneTransferPage />
      </main>
    </>
  );
}
