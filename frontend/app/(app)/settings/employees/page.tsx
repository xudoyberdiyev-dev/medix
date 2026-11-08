import { TopBar } from "@/components/shell/topbar";
import { StaffPage } from "@/features/employees/staff-page";

export default function Page() {
  return (
    <>
      <TopBar titleKey="settingsEmployees" />
      <main className="flex-1 overflow-y-auto p-6">
        <StaffPage />
      </main>
    </>
  );
}
