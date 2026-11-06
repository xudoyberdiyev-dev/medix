import { Suspense } from "react";
import { TopBar } from "@/components/shell/topbar";
import { ZoneTransfersPage } from "@/features/zone-transfers/zone-transfers-page";

export default function Page() {
  return (
    <>
      <TopBar title="Zona koʻchirishlari" />
      <main className="flex-1 overflow-y-auto p-6">
        <Suspense>
          <ZoneTransfersPage />
        </Suspense>
      </main>
    </>
  );
}
