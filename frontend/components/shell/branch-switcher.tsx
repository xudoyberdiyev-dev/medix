"use client";

import { useTranslations } from "next-intl";
import { Building2, Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useMe } from "@/features/auth/session";
import { useBranchList } from "@/features/organization/api";
import { cn } from "@/lib/cn";
import { effectiveBranchId, useBranchStore } from "@/lib/stores/branch";

/** Filial tanlagichi (SPEC 4: Umumiy). Barcha filiallarni koʻradiganlar uchun — menyu, boshqalar uchun — oʻz filiali. */
export function BranchSwitcher() {
  const t = useTranslations("shell");
  const me = useMe();
  const branches = useBranchList();
  const { branchId, setBranchId } = useBranchStore();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  if (!me.data || !branches.data) return null;
  const active = branches.data.filter((b) => b.active);
  const current = effectiveBranchId(
    me.data,
    branchId,
    active.map((b) => b.id),
  );
  const label = current === null ? t("allBranches") : (branches.data.find((b) => b.id === current)?.name ?? "");

  if (!me.data.allBranches) {
    return label ? (
      <span className="flex h-control-md items-center gap-2 px-3">
        <Building2 size={16} strokeWidth={1.5} aria-hidden className="text-text-secondary" />
        <span>{label}</span>
      </span>
    ) : null;
  }

  const options: { id: number | null; name: string; code?: string }[] = [{ id: null, name: t("allBranches") }, ...active];
  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Filial: ${label}`}
        onClick={() => setOpen((o) => !o)}
        className="flex h-control-md items-center gap-2 rounded-control border border-border px-3 hover:bg-background"
      >
        <Building2 size={16} strokeWidth={1.5} aria-hidden className="text-text-secondary" />
        <span>{label}</span>
        <ChevronDown size={16} strokeWidth={1.5} aria-hidden className="text-text-secondary" />
      </button>
      {open ? (
        <ul
          role="listbox"
          aria-label={t("branch")}
          className="absolute right-0 z-30 mt-1 min-w-56 rounded-control border border-border bg-surface py-1 shadow-overlay"
        >
          {options.map((o) => {
            const selected = o.id === current;
            return (
              <li
                key={o.id ?? "all"}
                role="option"
                aria-selected={selected}
                tabIndex={0}
                onClick={() => (setBranchId(o.id), setOpen(false))}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setBranchId(o.id), setOpen(false))}
                className={cn("flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-background", selected && "text-primary")}
              >
                <span className="flex-1">{o.name}</span>
                {o.code ? <span className="font-mono text-caption text-text-secondary">{o.code}</span> : null}
                {selected ? <Check size={16} strokeWidth={1.5} aria-hidden /> : <span className="w-4" />}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
