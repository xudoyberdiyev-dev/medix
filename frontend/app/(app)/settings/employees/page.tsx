import { TopBar } from "@/components/shell/topbar";
import { EmployeesPage } from "@/features/employees/employees-page";

export default function Page() {
  return (
    <>
      <TopBar title="Sozlamalar · Xodimlar" />
      <main className="flex-1 overflow-y-auto p-6">
        <EmployeesPage />
      </main>
    </>
  );
}
