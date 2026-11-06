import { Suspense } from "react";
import { TopBar } from "@/components/shell/topbar";
import { WriteOffsPage } from "@/features/write-offs/write-offs-page";

export default function Page() {
  return (
    <>
      <TopBar title="Hisobdan chiqarish" />
      <main className="flex-1 overflow-y-auto p-6">
        <Suspense>
          <WriteOffsPage />
        </Suspense>
      </main>
    </>
  );
}
