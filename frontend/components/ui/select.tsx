"use client";

import { useTranslations } from "next-intl";
import { Check, ChevronDown, Plus, Search, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Field, controlClass, hintId, type ControlSize } from "./field";
import { Icon } from "./icon";
import { Checkbox } from "./selection-controls";

export interface SelectOption {
  value: string;
  label: string;
  sub?: string;
  meta?: string;
  /** `meta` ni `warning` rangida koʻrsatish (masalan, qoldiq kam). */
  metaWarning?: boolean;
  disabled?: boolean;
}

interface BaseProps {
  label: string;
  options: SelectOption[];
  searchable?: boolean;
  /** Serverdan qidirish; berilsa `options` boshlangʻich roʻyxat sifatida ishlatiladi. */
  loadOptions?: (query: string) => Promise<SelectOption[]>;
  /** Variantlar hali yuklanmoqda (masalan, maʼlumotnoma soʻrovi) — «Hech narsa topilmadi» oʻrniga «Yuklanmoqda…». */
  loading?: boolean;
  placeholder?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  size?: ControlSize;
  className?: string;
  /** Roʻyxat ostidagi amal (masalan, «Yangi ishlab chiqaruvchi»). */
  footer?: { label: string; onSelect: () => void };
}

export interface SingleSelectProps extends BaseProps {
  multiple?: false;
  value: string | null;
  onChange: (value: string | null) => void;
}

export interface MultiSelectProps extends BaseProps {
  multiple: true;
  value: string[];
  onChange: (value: string[]) => void;
}

export type SelectProps = SingleSelectProps | MultiSelectProps;

const SEARCH_DEBOUNCE_MS = 250;

export function filterOptions(options: SelectOption[], query: string): SelectOption[] {
  const q = query.trim().toLocaleLowerCase("uz");
  if (!q) return options;
  return options.filter((o) => o.label.toLocaleLowerCase("uz").includes(q) || o.sub?.toLocaleLowerCase("uz").includes(q));
}

/** Mos kelgan qismni qalin koʻrsatadi. */
function Highlight({ text, query }: { text: string; query: string }): ReactNode {
  const q = query.trim();
  if (!q) return text;
  const i = text.toLocaleLowerCase("uz").indexOf(q.toLocaleLowerCase("uz"));
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark className="bg-transparent font-semibold text-inherit">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

/**
 * Tanlash roʻyxati (design/system: Select): oddiy, qidiruvli va koʻp tanlovli.
 * Klaviatura: Enter/Space/↓ ochadi, ↑↓ harakatlanadi, Enter tanlaydi, Esc yopadi.
 */
export function Select(props: SelectProps) {
  const { label, options, searchable, loadOptions, placeholder, hint, error, required, disabled, size = "md", className } = props;
  const t = useTranslations("ui");
  const id = useId();
  const listId = `${id}-list`;
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [remote, setRemote] = useState<SelectOption[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [known, setKnown] = useState<Map<string, SelectOption>>(new Map());

  const selected: string[] = props.multiple ? props.value : props.value ? [props.value] : [];
  const showSearch = searchable || Boolean(loadOptions);

  // O3: masofaviy roʻyxat ochilishi bilan (boʻsh soʻrov) yuklanadi; yozilganda serverda filtrlanadi
  const visible = useMemo(() => (loadOptions && remote ? remote : filterOptions(options, query)), [loadOptions, remote, options, query]);

  // Chaqiruvchi har renderda yangi funksiya bersa ham soʻrov qayta-qayta ketmasin
  const loadRef = useRef(loadOptions);
  useEffect(() => {
    loadRef.current = loadOptions;
  });
  const remoteMode = Boolean(loadOptions);

  useEffect(() => {
    const load = loadRef.current;
    if (!remoteMode || !load || !open) return;
    let cancelled = false;
    const t = setTimeout(
      () => {
        setLoading(true);
        load(query)
          .then((res) => {
            if (!cancelled) setRemote(res);
          })
          .catch(() => {
            if (!cancelled) setRemote([]);
          })
          .finally(() => {
            if (!cancelled) setLoading(false);
          });
      },
      query.trim() ? SEARCH_DEBOUNCE_MS : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [remoteMode, open, query]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    if (open && showSearch) searchRef.current?.focus();
  }, [open, showSearch]);

  function openMenu() {
    if (disabled) return;
    setOpen(true);
    const firstSelected = visible.findIndex((o) => selected.includes(o.value));
    setActive(Math.max(0, firstSelected));
  }

  function close(returnFocus = true) {
    setOpen(false);
    setQuery("");
    setRemote(null);
    if (returnFocus) triggerRef.current?.focus();
  }

  function labelOf(value: string): string {
    return options.find((o) => o.value === value)?.label ?? known.get(value)?.label ?? value;
  }

  function choose(option: SelectOption) {
    if (option.disabled) return;
    setKnown((m) => new Map(m).set(option.value, option));
    if (props.multiple) {
      const next = props.value.includes(option.value) ? props.value.filter((v) => v !== option.value) : [...props.value, option.value];
      props.onChange(next);
    } else {
      props.onChange(option.value);
      close();
    }
  }

  function removeValue(value: string) {
    if (props.multiple) props.onChange(props.value.filter((v) => v !== value));
  }

  function move(delta: number) {
    if (visible.length === 0) return;
    let next = active;
    for (let i = 0; i < visible.length; i++) {
      next = (next + delta + visible.length) % visible.length;
      if (!visible[next].disabled) break;
    }
    setActive(next);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        move(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        move(-1);
        break;
      case "Enter":
        e.preventDefault();
        if (visible[active]) choose(visible[active]);
        break;
      case "Escape":
        e.preventDefault();
        close();
        break;
      case "Tab":
        close(false);
        break;
    }
  }

  const activeId = open && visible[active] ? `${id}-opt-${active}` : undefined;

  return (
    <Field id={id} label={label} required={required} hint={hint} error={error} className={className} labelAs="span">
      <div ref={rootRef} className="relative" onKeyDown={onKeyDown}>
        <button
          ref={triggerRef}
          type="button"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          aria-labelledby={`${id}-label`}
          aria-activedescendant={showSearch ? undefined : activeId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? hintId(id) : undefined}
          disabled={disabled}
          onClick={() => (open ? close() : openMenu())}
          className={cn(
            controlClass({ size, error: Boolean(error), disabled }),
            "cursor-pointer text-left",
            props.multiple && selected.length > 0 && "h-auto min-h-control-md flex-wrap py-1",
          )}
        >
          {selected.length === 0 ? (
            <span className="flex-1 truncate text-text-disabled">{placeholder ?? t("choose")}</span>
          ) : props.multiple ? (
            <span className="flex flex-1 flex-wrap gap-1">
              {selected.map((v) => (
                <span
                  key={v}
                  className="inline-flex h-6 items-center gap-1 rounded-control border border-border bg-background pr-0.5 pl-2 text-table"
                >
                  {labelOf(v)}
                  <span
                    role="button"
                    tabIndex={-1}
                    aria-label={t("removeItem", { name: labelOf(v) })}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeValue(v);
                    }}
                    className="flex size-5 items-center justify-center rounded-sm text-text-secondary hover:bg-border hover:text-text-primary"
                  >
                    <X size={14} strokeWidth={1.5} aria-hidden />
                  </span>
                </span>
              ))}
            </span>
          ) : (
            <span className="flex-1 truncate">{labelOf(selected[0])}</span>
          )}
          <Icon icon={ChevronDown} className="ml-auto text-text-secondary" />
        </button>

        {open ? (
          <div className="absolute z-30 mt-1 w-full min-w-60 rounded-card border border-border bg-surface p-1 shadow-overlay">
            {showSearch ? (
              <div className={cn(controlClass({ size: "sm" }), "mb-2")}>
                <Icon icon={Search} className="text-text-secondary" />
                <input
                  ref={searchRef}
                  type="text"
                  value={query}
                  aria-label={t("search")}
                  aria-controls={listId}
                  aria-activedescendant={activeId}
                  placeholder={t("search")}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActive(0);
                  }}
                  className="h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-text-disabled"
                />
              </div>
            ) : null}
            <ul
              id={listId}
              role="listbox"
              aria-multiselectable={props.multiple || undefined}
              aria-labelledby={`${id}-label`}
              className="max-h-72 overflow-y-auto"
            >
              {loading || (remoteMode && remote === null) || (props.loading && visible.length === 0) ? (
                <li className="px-2 py-2 text-text-secondary">{t("selectLoading")}</li>
              ) : visible.length === 0 ? (
                <li className="px-2 py-2 text-text-secondary">{t("selectEmpty")}</li>
              ) : (
                visible.map((o, i) => {
                  const isSelected = selected.includes(o.value);
                  return (
                    <li
                      key={o.value}
                      id={`${id}-opt-${i}`}
                      role="option"
                      aria-selected={isSelected}
                      aria-disabled={o.disabled || undefined}
                      onMouseEnter={() => setActive(i)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => choose(o)}
                      className={cn(
                        "flex min-h-8 cursor-pointer items-center gap-2 rounded-control px-2 py-1.5",
                        i === active && "bg-table-header outline outline-1 -outline-offset-1 outline-border",
                        isSelected && !props.multiple && "bg-primary-soft",
                        o.disabled && "cursor-not-allowed text-text-disabled",
                      )}
                    >
                      {props.multiple ? (
                        <span className="pointer-events-none">
                          <Checkbox checked={isSelected} disabled={o.disabled} onChange={() => undefined} aria-label={o.label} />
                        </span>
                      ) : null}
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span>
                          <Highlight text={o.label} query={query} />
                        </span>
                        {o.sub ? <span className="text-caption text-text-secondary">{o.sub}</span> : null}
                      </span>
                      {o.meta ? (
                        <span
                          className={cn(
                            "tabular ml-auto text-right text-caption whitespace-nowrap",
                            o.metaWarning ? "text-warning" : "text-text-secondary",
                          )}
                        >
                          {o.meta}
                        </span>
                      ) : null}
                      {isSelected && !props.multiple ? <Icon icon={Check} className="text-primary-button" /> : null}
                    </li>
                  );
                })
              )}
            </ul>
            {props.footer ? (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setOpen(false);
                  props.footer?.onSelect();
                }}
                className="mt-1 flex h-8 w-full items-center gap-2 rounded-control border-t border-border px-2 text-left font-medium text-primary-button hover:bg-table-header"
              >
                <Icon icon={Plus} />
                {props.footer.label}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </Field>
  );
}
