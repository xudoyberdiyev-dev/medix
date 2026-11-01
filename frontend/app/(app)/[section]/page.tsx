import { Construction } from "lucide-react";
import { notFound } from "next/navigation";
import { navigation } from "@/components/shell/nav";
import { TopBar } from "@/components/shell/topbar";
import { EmptyState } from "@/components/ui/system-states";

/** Oʻz sahifasi bor boʻlimlar bu yerda emas. */
const BUILT = new Set(["/", "/settings", "/dictionaries", "/products"]);
const sections = navigation.flatMap((g) => g.items).filter((i) => !BUILT.has(i.href));

export function generateStaticParams() {
  return sections.map((s) => ({ section: s.href.slice(1) }));
}

/** Hali qurilmagan boʻlimlar uchun vaqtinchalik sahifa. Har boʻlim oʻz bosqichida almashtiriladi. */
export default async function SectionPlaceholder({ params }: PageProps<"/[section]">) {
  const { section } = await params;
  const item = sections.find((s) => s.href === `/${section}`);
  if (!item) notFound();
  return (
    <>
      <TopBar title={item.label} />
      <main className="flex-1 overflow-y-auto p-6">
        <h1 className="text-page-title">{item.label}</h1>
        <div className="mt-6 rounded-card border border-border bg-surface">
          <EmptyState
            icon={Construction}
            title="Bu boʻlim hali qurilmoqda"
            description="Ish rejasi va qaysi bosqichda tayyor boʻlishi PLAN.md faylida yozilgan."
          />
        </div>
      </main>
    </>
  );
}
