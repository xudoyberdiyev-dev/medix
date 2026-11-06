import { Suspense } from "react";
import { TopBar } from "@/components/shell/topbar";
import { ReceiptsPage } from "@/features/receipts/receipts-page";

export default function Page() {
  return (
    <>
      <TopBar title="Kirim" />
      <main className="flex-1 overflow-y-auto p-6">
        <Suspense>
          <ReceiptsPage />
        </Suspense>
      </main>
    </>
  );
}
