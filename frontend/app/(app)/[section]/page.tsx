import { notFound } from "next/navigation";
import { navigation } from "@/components/shell/nav";
import { SectionPlaceholderBody } from "./placeholder";

/** Oʻz sahifasi bor boʻlimlar bu yerda emas. */
const BUILT = new Set(["/", "/settings", "/dictionaries", "/products", "/customers", "/suppliers", "/prices", "/stock", "/expiry"]);
const sections = navigation.flatMap((g) => g.items).filter((i) => !BUILT.has(i.href) && !i.href.slice(1).includes("/"));

export function generateStaticParams() {
  return sections.map((s) => ({ section: s.href.slice(1) }));
}

/** Hali qurilmagan boʻlimlar uchun vaqtinchalik sahifa. Har boʻlim oʻz bosqichida almashtiriladi. */
export default async function SectionPlaceholder({ params }: PageProps<"/[section]">) {
  const { section } = await params;
  const item = sections.find((s) => s.href === `/${section}`);
  if (!item) notFound();
  return <SectionPlaceholderBody navKey={item.key} />;
}
