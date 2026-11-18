import { TopBar } from "@/components/shell/topbar";
import { KkFormPage } from "@/features/expected-receipts/kk-form-page";

/** KK — yangi kutilayotgan kirim. */
export default function Page() {
  return (
    <>
      <TopBar titleKey="expectedReceipts" />
      <main className="flex-1 overflow-y-auto p-6">
        <KkFormPage id={null} />
      </main>
    </>
  );
}
