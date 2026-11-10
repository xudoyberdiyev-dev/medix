import { TopBar } from "@/components/shell/topbar";
import { OpeningDocPage } from "@/features/opening/opening-drawer";

/** BQ (tovar) — yangi hujjat (prototip `OpeningDoc`). */
export default function Page() {
  return (
    <>
      <TopBar titleKey="opening" />
      <main className="flex-1 overflow-y-auto p-6">
        <OpeningDocPage id={null} />
      </main>
    </>
  );
}
