"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ChartColumn,
  ClipboardList,
  FileText,
  LayoutGrid,
  Loader2,
  type LucideIcon,
  PackagePlus,
  Pill,
  Search,
  SearchX,
  Store,
  Tags,
  Truck,
  UserRound,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type KeyboardEvent, type MouseEvent, useEffect, useId, useMemo, useState } from "react";
import { useDialog } from "@/components/ui/use-dialog";
import { useMe } from "@/features/auth/session";
import { visibleReports } from "@/features/reports/catalog";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { cn } from "@/lib/cn";
import { matchesSearch } from "@/lib/search";
import { navigationFor } from "./nav";

type ServerHit = components["schemas"]["Hit"];
export type HitKind = ServerHit["kind"] | "PAGE" | "REPORT";

export interface PaletteHit {
  key: string;
  kind: HitKind;
  title: string;
  subtitle?: string | null;
  link: string;
}

/** Guruhlar tartibi va nomlari (Ctrl+K natijalari shu tartibda). */
export const KIND_LABELS: Record<HitKind, string> = {
  PAGE: "Sahifalar",
  REPORT: "Hisobotlar",
  ORDER: "Buyurtmalar",
  RECEIPT: "Kirimlar",
  PRICE_CHANGE: "Narx oʻzgarishlari (NO)",
  TRIP: "Reyslar",
  PRODUCT: "Mahsulotlar",
  CUSTOMER: "Mijozlar",
  SUPPLIER: "Yetkazib beruvchilar",
  EMPLOYEE: "Xodimlar",
};

const KIND_ICONS: Record<HitKind, LucideIcon> = {
  PAGE: LayoutGrid,
  REPORT: ChartColumn,
  ORDER: ClipboardList,
  RECEIPT: PackagePlus,
  PRICE_CHANGE: Tags,
  TRIP: Truck,
  PRODUCT: Pill,
  CUSTOMER: Users,
  SUPPLIER: Store,
  EMPLOYEE: UserRound,
};

export const MIN_QUERY = 2;
const LOCAL_LIMIT = 5;

/** Sahifalar (menyudan, ruxsat bo'yicha) va hisobotlar (katalogdan) — serversiz, darhol. */
export function localHits(query: string, permissions: string[] | undefined): PaletteHit[] {
  if (!permissions || query.trim().length < MIN_QUERY) return [];
  const pages = navigationFor(permissions)
    .flatMap((g) => g.items.map((i) => ({ ...i, group: g.title ?? "" })))
    .filter((i) => matchesSearch(query, [i.label, i.group]))
    .slice(0, LOCAL_LIMIT)
    .map<PaletteHit>((i) => ({ key: `page-${i.key}`, kind: "PAGE", title: i.label, subtitle: i.group || null, link: i.href }));
  const reports = visibleReports(permissions)
    .filter((r): r is typeof r & { href: string } => r.href !== null)
    .filter((r) => matchesSearch(query, [r.title, r.description]))
    .slice(0, LOCAL_LIMIT)
    .map<PaletteHit>((r) => ({ key: `report-${r.key}`, kind: "REPORT", title: r.title, subtitle: r.description, link: r.href }));
  return [...pages, ...reports];
}

/** Natijalarni KIND_LABELS tartibida guruhlaydi (boʻsh guruhlar tashlanadi). */
export function groupHits(hits: PaletteHit[]): { kind: HitKind; label: string; hits: PaletteHit[] }[] {
  return (Object.keys(KIND_LABELS) as HitKind[])
    .map((kind) => ({ kind, label: KIND_LABELS[kind], hits: hits.filter((h) => h.kind === kind) }))
    .filter((g) => g.hits.length > 0);
}

function useDebounced(value: string, ms: number): string {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Ctrl+K universal qidiruv (SPEC 4 «Umumiy»): hujjat, mahsulot, kontragent, hisobot va sahifalar. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useDialog(open, onClose);
  if (!open) return null;
  return (
    <dialog
      ref={ref}
      aria-label="Qidiruv"
      onClick={(e: MouseEvent<HTMLDialogElement>) => e.target === e.currentTarget && onClose()}
      className="mx-auto mt-[12vh] w-full max-w-xl flex-col rounded-modal bg-surface p-0 text-text-primary shadow-overlay open:flex backdrop:bg-overlay"
    >
      <PaletteBody onClose={onClose} />
    </dialog>
  );
}

function PaletteBody({ onClose }: { onClose: () => void }) {
  const me = useMe();
  const router = useRouter();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const q = useDebounced(query.trim(), 200);
  const server = useQuery({
    queryKey: ["search", q],
    queryFn: () => unwrap(api.GET("/api/search", { params: { query: { q } } })),
    enabled: q.length >= MIN_QUERY,
    staleTime: 30_000,
  });
  const hits = useMemo<PaletteHit[]>(() => {
    const local = localHits(query, me.data?.permissions);
    const remote =
      q.length >= MIN_QUERY
        ? (server.data?.hits ?? []).map<PaletteHit>((h) => ({
            key: `${h.kind}-${h.id}`,
            kind: h.kind,
            title: h.title,
            subtitle: h.subtitle,
            link: h.link,
          }))
        : [];
    return [...local, ...remote];
  }, [query, q, me.data?.permissions, server.data]);
  const groups = groupHits(hits);
  const flat = groups.flatMap((g) => g.hits);
  const current = Math.min(active, Math.max(flat.length - 1, 0));

  const go = (h: PaletteHit | undefined) => {
    if (!h) return;
    onClose();
    router.push(h.link);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((current + 1) % Math.max(flat.length, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((current - 1 + flat.length) % Math.max(flat.length, 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(flat[current]);
    }
  };

  const short = query.trim().length < MIN_QUERY;
  const loading = !short && (server.isFetching || q !== query.trim());
  return (
    <>
      <div className="flex items-center gap-3 border-b border-border px-4">
        <Search size={20} strokeWidth={1.5} aria-hidden className="text-text-secondary" />
        <input
          autoFocus
          role="combobox"
          aria-expanded={flat.length > 0}
          aria-controls={listId}
          aria-activedescendant={flat[current] ? `${listId}-${flat[current].key}` : undefined}
          aria-label="Qidirish"
          placeholder="Hujjat raqami, mahsulot, mijoz, STIR, hisobot…"
          value={query}
          onChange={(e) => (setQuery(e.target.value), setActive(0))}
          onKeyDown={onKeyDown}
          className="h-14 flex-1 bg-transparent text-body outline-none placeholder:text-text-disabled"
        />
        {loading ? <Loader2 size={16} strokeWidth={1.5} aria-label="Qidirilmoqda" className="animate-spin text-text-secondary" /> : null}
        <kbd className="rounded-sm border border-border px-1.5 text-caption text-text-secondary">Esc</kbd>
      </div>
      <div className="max-h-[60vh] overflow-y-auto py-2">
        {short ? (
          <p className="px-4 py-6 text-center text-text-secondary">Kamida 2 ta belgi yozing. Kirill yoki lotinda — farqi yoʻq.</p>
        ) : server.error && flat.length === 0 ? (
          <p role="alert" className="px-4 py-6 text-center text-text-secondary">
            Qidiruv bajarilmadi. Ulanishni tekshirib, qayta yozing.
          </p>
        ) : flat.length === 0 && !loading ? (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-text-secondary">
            <SearchX size={20} strokeWidth={1.5} aria-hidden />
            <span>Hech narsa topilmadi. Boshqa soʻz yoki hujjat raqamini yozib koʻring.</span>
          </div>
        ) : (
          <ul id={listId} role="listbox" aria-label="Natijalar">
            {groups.map((g) => (
              <li key={g.kind} role="presentation">
                <div className="px-4 pt-2 pb-1 text-caption font-medium text-text-secondary">{g.label}</div>
                <ul role="group" aria-label={g.label}>
                  {g.hits.map((h) => {
                    const selected = flat[current]?.key === h.key;
                    const Icon = KIND_ICONS[h.kind] ?? FileText;
                    return (
                      <li
                        key={h.key}
                        id={`${listId}-${h.key}`}
                        role="option"
                        aria-selected={selected}
                        onMouseEnter={() => setActive(flat.indexOf(h))}
                        onClick={() => go(h)}
                        className={cn("flex cursor-pointer items-center gap-3 px-4 py-2", selected && "bg-background")}
                      >
                        <Icon size={16} strokeWidth={1.5} aria-hidden className="shrink-0 text-text-secondary" />
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate">{h.title}</span>
                          {h.subtitle ? <span className="truncate text-caption text-text-secondary">{h.subtitle}</span> : null}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

/** Ctrl+K / ⌘K — qidiruvni ochish (kiritish maydonida ham, kirill klaviaturada ham ishlaydi). */
export function useCommandPaletteHotkey(onOpen: () => void) {
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.code === "KeyK" || e.key.toLowerCase() === "k")) {
        e.preventDefault();
        onOpen();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onOpen]);
}
