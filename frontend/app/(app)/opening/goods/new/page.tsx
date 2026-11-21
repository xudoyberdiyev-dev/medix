import { TopBar } from "@/components/shell/topbar";
import { OpeningDocPage } from "@/features/opening/opening-drawer";
import { FreshOnPush } from "@/components/shell/fresh-on-push";

/** BQ (tovar) — yangi hujjat (prototip `OpeningDoc`). */
export default function Page() {
  return (
    <>
      <TopBar titleKey="opening" />
      <main className="flex-1 overflow-y-auto p-6">
        <FreshOnPush>
          <OpeningDocPage id={null} />
        </FreshOnPush>
      </main>
    </>
  );
}
