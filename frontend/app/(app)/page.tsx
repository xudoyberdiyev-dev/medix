import { Construction } from "lucide-react";
import { TopBar } from "@/components/shell/topbar";
import { EmptyState } from "@/components/ui/empty-state";

export default function HomePage() {
  return (
    <>
      <TopBar title="Bosh sahifa" />
      <main className="flex-1 overflow-y-auto p-6">
        <h1 className="text-page-title">Bosh sahifa</h1>
        <div className="mt-6 rounded-card border border-border bg-surface">
          <EmptyState
            icon={<Construction size={20} strokeWidth={1.5} aria-hidden />}
            title="Bosh sahifa hali qurilmoqda"
            description="Koʻrsatkichlar kartalari va «Diqqat talab qiladi» bloki 10-bosqichda qoʻshiladi. Hozir tizim poydevori tayyor."
          />
        </div>
      </main>
    </>
  );
}
