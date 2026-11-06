"use client";

import { Bookmark, BookmarkCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { addView, isCurrentView, MAX_NAME, MAX_VIEWS, parseViews, removeView, type SavedView } from "@/lib/saved-views";
import { Button } from "./button";
import { TextField } from "./text-field";

const ERRORS = {
  empty: "Koʻrinish nomini yozing",
  tooLong: `Nom ${MAX_NAME} belgidan oshmasin — qisqaroq yozing`,
  limit: `${MAX_VIEWS} tadan koʻp koʻrinish saqlanmaydi — keraksizini oʻchiring`,
} as const;

function read(key: string): SavedView[] {
  try {
    return parseViews(localStorage.getItem(key));
  } catch {
    return [];
  }
}

function write(key: string, views: SavedView[]) {
  try {
    localStorage.setItem(key, JSON.stringify(views));
  } catch {
    /* xotira yopiq — koʻrinish faqat shu oynada qoladi */
  }
}

/**
 * «Koʻrinishlar» menyusi (jadvallar standarti): joriy filtrlar va ustunlarni nom bilan saqlash, bir bosishda ochish.
 * Brauzer xotirasi menyu ochilganda oʻqiladi (SSR bilan toʻqnashmaydi).
 */
export function SavedViews({
  storageKey,
  query,
  hidden,
  onApply,
}: {
  /** Jadval kaliti, masalan «medix-products-views». */
  storageKey: string;
  /** Joriy URL soʻrovi. */
  query: string;
  hidden: string[];
  onApply: (view: SavedView) => void;
}) {
  const [open, setOpen] = useState(false);
  const [views, setViews] = useState<SavedView[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | undefined>();

  function toggle() {
    if (!open) {
      setViews(read(storageKey));
      setError(undefined);
    }
    setOpen((o) => !o);
  }

  function save() {
    const r = addView(read(storageKey), name, query, hidden);
    if (!r.ok) {
      setError(ERRORS[r.error]);
      return;
    }
    write(storageKey, r.views);
    setViews(r.views);
    setName("");
    setError(undefined);
  }

  function remove(n: string) {
    const next = removeView(read(storageKey), n);
    write(storageKey, next);
    setViews(next);
  }

  return (
    <div className="relative">
      <Button variant="secondary" size="sm" icon={Bookmark} onClick={toggle} aria-expanded={open}>
        Koʻrinishlar
      </Button>
      {open ? (
        <div className="absolute right-0 z-30 mt-1 flex w-72 flex-col gap-2 rounded-control border border-border bg-surface p-3 shadow-overlay">
          {views.length === 0 ? (
            <div className="text-caption text-text-secondary">Hali saqlangan koʻrinish yoʻq. Filtr va ustunlarni tanlab, nom bering.</div>
          ) : (
            <ul className="flex flex-col gap-1">
              {views.map((v) => {
                const current = isCurrentView(v, query, hidden);
                return (
                  <li key={v.name} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        onApply(v);
                        setOpen(false);
                      }}
                      className="flex min-w-0 flex-1 items-center gap-2 rounded-control px-2 py-1 text-left hover:bg-primary-soft"
                      aria-current={current ? "true" : undefined}
                    >
                      {current ? (
                        <BookmarkCheck size={16} strokeWidth={1.5} aria-hidden className="shrink-0 text-primary" />
                      ) : (
                        <Bookmark size={16} strokeWidth={1.5} aria-hidden className="shrink-0 text-text-secondary" />
                      )}
                      <span className="truncate">{v.name}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(v.name)}
                      className="rounded-control p-1 text-text-secondary hover:text-danger"
                      aria-label={`Oʻchirish: ${v.name}`}
                      title="Oʻchirish"
                    >
                      <Trash2 size={16} strokeWidth={1.5} aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex items-end gap-2 border-t border-border pt-2">
            <div className="flex-1">
              <TextField label="Yangi koʻrinish nomi" size="sm" value={name} onChange={setName} error={error} />
            </div>
            <Button variant="secondary" size="sm" onClick={save}>
              Saqlash
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
