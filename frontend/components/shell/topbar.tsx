import { Bell, Building2, ChevronDown, Search } from "lucide-react";

/** Yuqori panel (design/system: TopBar). Maʼlumotlar 1-bosqichda sessiyadan olinadi. */
export function TopBar({ title }: { title: string }) {
  return (
    <header className="flex h-topbar items-center gap-4 border-b border-border bg-surface px-6">
      <div className="text-body font-medium">{title}</div>
      <div className="ml-auto flex items-center gap-3">
        <button
          type="button"
          className="flex h-control-md w-72 items-center gap-2 rounded-control border border-border bg-surface px-3 text-text-disabled hover:border-text-disabled"
        >
          <Search size={16} strokeWidth={1.5} aria-hidden />
          <span>Qidirish</span>
          <kbd className="ml-auto rounded-sm border border-border px-1.5 text-caption text-text-secondary">Ctrl K</kbd>
        </button>
        <button
          type="button"
          className="flex h-control-md items-center gap-2 rounded-control border border-border px-3 hover:bg-background"
        >
          <Building2 size={16} strokeWidth={1.5} aria-hidden className="text-text-secondary" />
          <span>Toshkent</span>
          <ChevronDown size={16} strokeWidth={1.5} aria-hidden className="text-text-secondary" />
        </button>
        <button
          type="button"
          aria-label="Bildirishnomalar"
          className="flex size-control-md items-center justify-center rounded-control hover:bg-background"
        >
          <Bell size={20} strokeWidth={1.5} aria-hidden />
        </button>
      </div>
    </header>
  );
}
