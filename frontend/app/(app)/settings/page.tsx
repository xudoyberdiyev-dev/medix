import { ScrollText, Settings2, Users } from "lucide-react";
import Link from "next/link";
import { TopBar } from "@/components/shell/topbar";

const sections = [
  { href: "/settings/employees", icon: Users, title: "Xodimlar", description: "Loginlar, rollar, bloklash, vaqtinchalik parol" },
  { href: "/settings/audit", icon: ScrollText, title: "Audit jurnali", description: "Kim, qachon, nima oʻzgartirdi" },
  { href: "/setup", icon: Settings2, title: "Sozlash ustasi", description: "Birinchi ishga tushirish: kompaniya, filiallar, omborlar" },
];

export default function SettingsPage() {
  return (
    <>
      <TopBar title="Sozlamalar" />
      <main className="flex-1 overflow-y-auto p-6">
        <h1 className="mb-6 text-page-title">Sozlamalar</h1>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4">
          {sections.map(({ href, icon: Icon, title, description }) => (
            <Link
              key={href}
              href={href}
              className="flex gap-3 rounded-card border border-border bg-surface p-5 transition-colors duration-150 hover:border-text-disabled"
            >
              <Icon size={20} strokeWidth={1.5} aria-hidden className="mt-0.5 shrink-0 text-primary" />
              <span>
                <span className="block text-subtitle">{title}</span>
                <span className="mt-1 block text-text-secondary">{description}</span>
              </span>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}
