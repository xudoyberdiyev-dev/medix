import { TopBar } from "@/components/shell/topbar";
import { CompanyPage } from "@/features/organization/company-page";

export default function Page() {
  return (
    <>
      <TopBar titleKey="company" />
      <main className="flex-1 overflow-y-auto p-6">
        <CompanyPage />
      </main>
    </>
  );
}
