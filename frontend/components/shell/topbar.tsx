import { BranchSwitcher } from "./branch-switcher";
import { LiveSync } from "./live-sync";
import { NotificationBell } from "./notification-bell";
import { SearchButton } from "./search-button";

/** Yuqori panel (design/system: TopBar): qidiruv, filial tanlagichi, bildirishnomalar. */
export function TopBar({ title }: { title: string }) {
  return (
    <header className="flex h-topbar items-center gap-4 border-b border-border bg-surface px-6 print:hidden">
      <div className="text-body font-medium">{title}</div>
      <div className="ml-auto flex items-center gap-3">
        <SearchButton />
        <BranchSwitcher />
        <LiveSync />
        <NotificationBell />
      </div>
    </header>
  );
}
