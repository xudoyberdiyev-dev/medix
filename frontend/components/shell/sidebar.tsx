"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navigation } from "./nav";

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** Sidebar (design/system: Sidebar) — fon brand-900, faol: oq matn + chapda 3px sidebar-active. */
export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="flex w-sidebar shrink-0 flex-col bg-brand-900 text-sidebar-text">
      <div className="flex h-topbar items-center gap-3 px-5">
        <span className="flex size-8 items-center justify-center rounded-control bg-primary-button font-semibold text-white">M</span>
        <span className="text-subtitle text-white">MEDIX</span>
      </div>
      <nav aria-label="Asosiy menyu" className="flex-1 overflow-y-auto px-3 pb-4">
        {navigation.map((group, gi) => (
          <div key={group.title ?? gi} className="mt-4 first:mt-2">
            {group.title ? <div className="px-3 pb-1 text-caption font-medium">{group.title}</div> : null}
            <ul>
              {group.items.map((item) => {
                const active = isActive(pathname, item.href);
                const Icon = item.icon;
                return (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`relative flex h-control-md items-center gap-3 rounded-control px-3 transition-colors duration-150 ease-out focus-visible:outline-sidebar-active ${
                        active ? "bg-sidebar-item-active-bg font-medium text-white" : "hover:bg-sidebar-item-active-bg hover:text-white"
                      }`}
                    >
                      {active ? <span aria-hidden className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-sidebar-active" /> : null}
                      <Icon size={20} strokeWidth={1.5} aria-hidden />
                      <span>{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
