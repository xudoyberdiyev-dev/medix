import { TopBar } from "@/components/shell/topbar";
import { WarehousesPage } from "@/features/organization/warehouses-page";

export default function Page() {
  return (
    <>
      <TopBar title="Sozlamalar · Omborlar va zonalar" />
      <main className="flex-1 overflow-y-auto p-6">
        <WarehousesPage />
      </main>
    </>
  );
}
