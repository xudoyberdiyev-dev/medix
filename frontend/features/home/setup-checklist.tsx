"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CircleCheck, Circle, ListChecks } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMe } from "@/features/auth/session";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { cn } from "@/lib/cn";

type Checklist = components["schemas"]["SetupChecklist"];

/** Hammasi bajarilganmi (karta yashiriladi). */
export function checklistComplete(c: Checklist | undefined): boolean {
  return !!c && c.items.every((i) => i.done);
}

/** U16: Direktor bosh sahifasida «Sozlash roʻyxati» — bajarilgani ✓, foiz; hammasi bajarilgach koʻrinmaydi. */
export function SetupChecklistCard() {
  const t = useTranslations("home.setup");
  const me = useMe();
  const director = me.data?.role.code === "DIRECTOR";
  const q = useQuery({
    queryKey: ["setup-checklist"],
    queryFn: () => unwrap(api.GET("/api/setup-checklist")),
    enabled: director,
    staleTime: 60_000,
  });
  if (!director || !q.data || checklistComplete(q.data)) return null;
  const c = q.data;
  return (
    <section aria-labelledby="setup-checklist" className="rounded-card border border-border bg-surface p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ListChecks size={20} strokeWidth={1.5} aria-hidden className="text-link" />
          <div>
            <h2 id="setup-checklist" className="text-subtitle">
              {t("title")}
            </h2>
            <p className="text-caption text-text-secondary">{t("sub", { p: c.donePercent })}</p>
          </div>
        </div>
        <div
          role="progressbar"
          aria-label={t("title")}
          aria-valuenow={c.donePercent}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-2 w-40 overflow-hidden rounded-full bg-background"
        >
          <div className="h-full rounded-full bg-primary-button" style={{ width: `${c.donePercent}%` }} />
        </div>
      </div>
      <ul className="mt-3 grid grid-cols-1 gap-1 sm:grid-cols-2 xl:grid-cols-4">
        {c.items.map((i) => (
          <li key={i.step}>
            <Link
              href={i.link}
              className={cn(
                "flex min-h-11 items-center gap-2 rounded-control px-2 hover:bg-background",
                i.done ? "text-text-secondary" : "text-text-primary",
              )}
            >
              {i.done ? (
                <CircleCheck size={16} strokeWidth={1.5} className="shrink-0 text-success" aria-label={t("done")} />
              ) : (
                <Circle size={16} strokeWidth={1.5} className="shrink-0 text-text-disabled" aria-hidden />
              )}
              <span className={cn("flex-1", i.done && "line-through")}>{t(`step.${i.step}`)}</span>
              {i.done ? null : <ArrowRight size={16} strokeWidth={1.5} aria-label={t("open")} className="text-link" />}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
