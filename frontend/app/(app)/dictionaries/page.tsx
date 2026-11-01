import { Suspense } from "react";
import { TopBar } from "@/components/shell/topbar";
import { DictionariesPage } from "@/features/dictionaries/dictionaries-page";

export default function Page() {
  return (
    <>
      <TopBar title="Maʼlumotnomalar" />
      <main className="flex-1 overflow-y-auto p-6">
        <Suspense>
          <DictionariesPage />
        </Suspense>
      </main>
    </>
  );
}
