import { TopBar } from "@/components/shell/topbar";
import { ReserveCodesPage } from "@/features/reserve-codes/reserve-codes-page";

export default function Page() {
  return (
    <>
      <TopBar titleKey="reserveCodes" />
      <main className="flex-1 overflow-y-auto p-6">
        <ReserveCodesPage />
      </main>
    </>
  );
}
