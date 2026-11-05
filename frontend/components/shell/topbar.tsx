import { Search } from "lucide-react";
import { BranchSwitcher } from "./branch-switcher";
import { NotificationBell } from "./notification-bell";

/** Yuqori panel (design/system: TopBar): qidiruv, filial tanlagichi, bildirishnomalar. */
export function TopBar({ title }: { title: string }) {
  return (
    <header className="flex h-topbar items-center gap-4 border-b border-border bg-surface px-6 print:hidden">
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
        <BranchSwitcher />
        <NotificationBell />
      </div>
    </header>
  );
}
