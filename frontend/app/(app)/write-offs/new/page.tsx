import { TopBar } from "@/components/shell/topbar";
import { NewWriteOffPage } from "@/features/write-offs/write-off-new-page";

/** HC — yangi hisobdan chiqarish (prototip `StockDocs`). */
export default function Page() {
  return (
    <>
      <TopBar titleKey="writeOffs" />
      <main className="flex-1 overflow-y-auto p-6">
        <NewWriteOffPage />
      </main>
    </>
  );
}
