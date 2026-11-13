import { TopBar } from "@/components/shell/topbar";
import { InvoicesPage } from "@/features/invoices/invoices-page";

export default function Page() {
  return (
    <>
      <TopBar titleKey="invoices" />
      <main className="flex-1 overflow-y-auto p-6">
        <InvoicesPage />
      </main>
    </>
  );
}
