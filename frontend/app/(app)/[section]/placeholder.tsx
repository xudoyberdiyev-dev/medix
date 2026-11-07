"use client";

import { Construction } from "lucide-react";
import { useTranslations } from "next-intl";
import type { NavKey } from "@/components/shell/nav";
import { TopBar } from "@/components/shell/topbar";
import { EmptyState } from "@/components/ui/system-states";

/** Hali qurilmagan boʻlim — sarlavha va xabar joriy tilda. */
export function SectionPlaceholderBody({ navKey }: { navKey: NavKey }) {
  const t = useTranslations();
  const title = t(`nav.${navKey}`);
  return (
    <>
      <TopBar title={title} />
      <main className="flex-1 overflow-y-auto p-6">
        <h1 className="text-page-title">{title}</h1>
        <div className="mt-6 rounded-card border border-border bg-surface">
          <EmptyState icon={Construction} title={t("ui.placeholder.title")} description={t("ui.placeholder.description")} />
        </div>
      </main>
    </>
  );
}
