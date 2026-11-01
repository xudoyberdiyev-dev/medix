import { Construction } from "lucide-react";
import { TopBar } from "@/components/shell/topbar";
import { EmptyState } from "@/components/ui/system-states";
import { SetupBanner } from "@/features/setup/setup-banner";

export default function HomePage() {
  return (
    <>
      <TopBar title="Bosh sahifa" />
      <main className="flex-1 overflow-y-auto p-6">
        <h1 className="text-page-title">Bosh sahifa</h1>
        <div className="mt-6 empty:hidden">
          <SetupBanner />
        </div>
        <div className="mt-6 rounded-card border border-border bg-surface">
          <EmptyState
            icon={Construction}
            title="Bosh sahifa hali qurilmoqda"
            description="Koʻrsatkichlar kartalari va «Diqqat talab qiladi» bloki 10-bosqichda qoʻshiladi. Hozir tizim poydevori tayyor."
          />
        </div>
      </main>
    </>
  );
}
