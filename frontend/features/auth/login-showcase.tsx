"use client";

import {
  Box,
  CircleCheck,
  Clock,
  MapPin,
  Package,
  Pause,
  Play,
  ReceiptText,
  ScanBarcode,
  ShieldCheck,
  ShoppingCart,
  Truck,
  Wallet,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, type ReactNode } from "react";
import { BrandLogo } from "@/components/ui/brand-logo";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { formatMoney, formatQuantity } from "@/lib/format";

/** Chap paneldagi modullar (O22: 5 ta, har birining oʻz sahnasi). */
export const SHOWCASE_MODULES = ["orders", "stock", "marking", "delivery", "money"] as const;
export type ShowcaseModule = (typeof SHOWCASE_MODULES)[number];

const TAB_ICONS: Record<ShowcaseModule, LucideIcon> = {
  orders: ShoppingCart,
  stock: Warehouse,
  marking: ScanBarcode,
  delivery: Truck,
  money: Wallet,
};

/** Sahna almashish oraligʻi (egasi: har 6 s). */
export const SHOWCASE_INTERVAL_MS = 6000;

/** Keyingi modul (aylanma). */
export function nextModule(m: ShowcaseModule): ShowcaseModule {
  return SHOWCASE_MODULES[(SHOWCASE_MODULES.indexOf(m) + 1) % SHOWCASE_MODULES.length];
}

/** DataMatrix namunasi 14×14 — deterministik (har ochilishda bir xil), chap va past chegarasi toʻliq, tepa/oʻng — navbatma-navbat. */
export function dataMatrixCells(): boolean[] {
  let seed = 7;
  const cells: boolean[] = [];
  for (let r = 0; r < 14; r++) {
    for (let c = 0; c < 14; c++) {
      seed = (seed * 9301 + 49297) % 233280;
      const edge = c === 0 || r === 13 || (r === 0 && c % 2 === 0) || (c === 13 && r % 2 === 1);
      cells.push(edge || seed / 233280 > 0.52);
    }
  }
  return cells;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return reduced;
}

const card = "rounded-[12px] border border-border bg-surface shadow-overlay";

function Badge({
  icon: BadgeIcon,
  tone,
  children,
}: {
  icon?: LucideIcon;
  tone: "primary" | "success" | "warning" | "neutral";
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[6px] rounded-control px-[10px] py-[4px] text-table font-medium",
        tone === "primary" && "bg-primary-soft text-link",
        tone === "success" && "bg-success-bg text-success",
        tone === "warning" && "bg-warning-bg text-warning",
        tone === "neutral" && "bg-surface text-text-secondary",
      )}
    >
      {BadgeIcon ? <BadgeIcon size={14} strokeWidth={1.5} aria-hidden /> : null}
      {children}
    </span>
  );
}

function IconTile({ icon }: { icon: LucideIcon }) {
  return (
    <span className="flex size-[40px] shrink-0 items-center justify-center rounded-card bg-primary-soft text-link">
      <Icon icon={icon} size="md" />
    </span>
  );
}

/** Namuna buyurtma (illyustratsiya — haqiqiy maʼlumot emas). */
const ORDER_LINES = [
  { name: "Paratsetamol 500 mg №10", qty: 120, price: 5432 },
  { name: "Amoksitsillin 500 mg №16", qty: 60, price: 21168 },
  { name: "Omeprazol 20 mg №30", qty: 40, price: 26208 },
];
const DOC_NO = "BY-TSH-000355";

function OrdersScene() {
  const t = useTranslations("login.sc");
  const total = ORDER_LINES.reduce((s, l) => s + l.qty * l.price, 0);
  return (
    <div className={cn(card, "w-full max-w-[600px] overflow-hidden")}>
      <div className="flex items-center justify-between gap-[12px] border-b border-border px-[20px] py-[16px]">
        <div className="flex min-w-0 items-center gap-[12px]">
          <IconTile icon={ReceiptText} />
          <div className="min-w-0">
            <div className="truncate text-caption text-text-secondary">{t("newOrder", { no: DOC_NO })}</div>
            <div className="truncate text-[16px] leading-6 font-semibold">{t("customer")}</div>
          </div>
        </div>
        <Badge icon={MapPin} tone="primary">
          {t("zone")}
        </Badge>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_96px_110px] px-[20px] text-body">
        <span className="border-b border-border py-[10px] text-caption text-text-secondary">{t("colProduct")}</span>
        <span className="border-b border-border py-[10px] text-right text-caption text-text-secondary">{t("colQty")}</span>
        <span className="border-b border-border py-[10px] text-right text-caption text-text-secondary">{t("colSum")}</span>
        {ORDER_LINES.map((l, i) => {
          const b = i < ORDER_LINES.length - 1 ? "border-b border-border" : "";
          return [
            <span key={`${l.name}-n`} className={cn("truncate py-[10px]", b)}>
              {l.name}
            </span>,
            <span key={`${l.name}-q`} className={cn("py-[10px] text-right text-text-secondary tabular-nums", b)}>
              {l.qty} × {formatQuantity(l.price)}
            </span>,
            <span key={`${l.name}-s`} className={cn("py-[10px] text-right font-medium tabular-nums", b)}>
              {formatMoney(String(l.qty * l.price))}
            </span>,
          ];
        })}
      </div>
      <div className="flex items-center justify-between gap-[12px] border-t border-border bg-table-header px-[20px] py-[14px]">
        <div className="flex flex-wrap gap-[8px]">
          <Badge icon={CircleCheck} tone="success">
            {t("withinLimit")}
          </Badge>
          <Badge icon={Clock} tone="neutral">
            {t("payDays", { n: 14 })}
          </Badge>
        </div>
        <div className="text-right">
          <div className="text-caption text-text-secondary">{t("total")}</div>
          <div className="text-[18px] leading-6 font-semibold tabular-nums">{formatMoney(String(total))}</div>
        </div>
      </div>
    </div>
  );
}

const SHELVES = ["A-01-1", "A-01-2", "A-01-3", "A-02-1", "A-03-1", "A-03-2", "B-01-1", "B-01-2", "B-02-3", "B-02-4", "C-01-1", "C-05-3"];
const PICK: Record<string, string> = { "A-01-2": "Paratsetamol · 120", "A-03-1": "Amoksitsillin · 60", "B-02-4": "Omeprazol · 40" };

function StockScene() {
  const t = useTranslations("login.sc");
  return (
    <div className="flex w-full max-w-[600px] flex-col gap-[12px]">
      <div className={cn(card, "grid grid-cols-4 gap-[8px] p-[16px]")}>
        {SHELVES.map((code) => (
          <div
            key={code}
            className={cn(
              "min-h-[56px] rounded-control px-[10px] py-[8px] text-caption",
              PICK[code] ? "bg-primary-button text-white" : "border border-border bg-table-header text-text-secondary",
            )}
          >
            <div className="font-semibold">{code}</div>
            <div className="truncate">{PICK[code] ?? t("notEmpty")}</div>
          </div>
        ))}
      </div>
      <div className={cn(card, "flex flex-wrap items-center justify-between gap-[12px] px-[16px] py-[14px]")}>
        <div className="flex items-center gap-[12px]">
          <IconTile icon={Package} />
          <div>
            <div className="text-caption text-text-secondary">{t("pickRoute")}</div>
            <div className="text-subtitle">A-01-2 → A-03-1 → B-02-4</div>
          </div>
        </div>
        <Badge icon={Clock} tone="warning">
          {t("fefo", { date: "08.2027" })}
        </Badge>
      </div>
    </div>
  );
}

const DM = dataMatrixCells();

function MarkingScene() {
  const t = useTranslations("login.sc");
  return (
    <div className={cn(card, "flex w-full max-w-[600px] flex-wrap items-center gap-[20px] p-[20px]")}>
      <div
        role="img"
        aria-label={t("dmLabel")}
        className="grid size-[148px] shrink-0 grid-cols-[repeat(14,minmax(0,1fr))] gap-px rounded-card border border-border p-[10px]"
      >
        {DM.map((on, i) => (
          <span key={i} className={cn("aspect-square", on ? "bg-text-primary" : "bg-surface")} />
        ))}
      </div>
      <div className="flex min-w-[220px] flex-1 flex-col gap-[10px]">
        <div className="text-caption text-text-secondary">{t("markTitle", { no: DOC_NO })}</div>
        <div className="flex items-baseline gap-[8px]">
          <span className="text-[32px] leading-10 font-semibold tabular-nums">310</span>
          <span className="text-[16px] text-text-secondary">{t("ofUnits", { n: 310 })}</span>
        </div>
        <div className="flex flex-wrap gap-[8px]">
          <Badge icon={Box} tone="primary">
            {t("boxes", { n: 3, units: 300 })}
          </Badge>
          <Badge icon={Package} tone="primary">
            {t("units", { n: 10 })}
          </Badge>
        </div>
        <div className="h-[6px] rounded-control bg-border">
          <div className="h-[6px] w-full rounded-control bg-primary" />
        </div>
        <span className="self-start">
          <Badge icon={ShieldCheck} tone="success">
            {t("noDup")}
          </Badge>
        </span>
      </div>
    </div>
  );
}

const STOPS = [
  { key: "s1", time: "09:12", done: true },
  { key: "s2", time: "09:58", done: true },
  { key: "s3", time: "10:24", done: true },
  { key: "s4", time: "11:10", done: true },
  { key: "s5", time: "12:05", done: false },
  { key: "s6", time: "12:40", done: false },
] as const;

function DeliveryScene() {
  const t = useTranslations("login.sc");
  const done = STOPS.filter((s) => s.done).length;
  return (
    <div className={cn(card, "w-full max-w-[600px] overflow-hidden")}>
      <div className="flex items-center justify-between gap-[12px] border-b border-border px-[20px] py-[16px]">
        <div className="flex min-w-0 items-center gap-[12px]">
          <IconTile icon={Truck} />
          <div className="min-w-0">
            <div className="truncate text-caption text-text-secondary">{t("trip", { no: "R-TSH-000088", plate: "01 A 000 AA" })}</div>
            <div className="text-[16px] leading-6 font-semibold">{t("todayRoute")}</div>
          </div>
        </div>
        <Badge icon={CircleCheck} tone="success">
          {done} / {STOPS.length}
        </Badge>
      </div>
      <div className="px-[20px] pt-[8px] pb-[14px]">
        {STOPS.map((s, i) => (
          <div key={s.key} className="flex items-center gap-[12px] border-b border-border py-[8px]">
            <span
              className={cn(
                "flex size-[28px] shrink-0 items-center justify-center rounded-full text-caption font-semibold",
                s.done ? "bg-primary-button text-white" : "bg-background text-text-secondary",
              )}
            >
              {i + 1}
            </span>
            <span className="min-w-0 flex-1 truncate text-body">{t(`stops.${s.key}`)}</span>
            <span className="text-table text-text-secondary tabular-nums">{s.time}</span>
            <span
              className={cn(
                "rounded-control px-[8px] py-[2px] text-caption font-medium",
                s.done ? "bg-success-bg text-success" : "bg-background text-text-secondary",
              )}
            >
              {s.done ? t("delivered") : t("waiting")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const AGING = [
  { key: "notDue", p: 62, bar: "bg-primary-button" },
  { key: "d1", p: 21, bar: "bg-sidebar-active" },
  { key: "d2", p: 10, bar: "bg-warning/70" },
  { key: "d3", p: 7, bar: "bg-danger" },
] as const;

function MoneyScene() {
  const t = useTranslations("login.sc");
  return (
    <div className="grid w-full max-w-[600px] grid-cols-2 gap-[12px]">
      <div className={cn(card, "px-[18px] py-[16px]")}>
        <div className="flex items-center gap-[8px] text-table text-text-secondary">
          <Icon icon={Wallet} />
          {t("cashToday")}
        </div>
        <div className="mt-[6px] text-[24px] leading-8 font-semibold tabular-nums">{formatMoney("18450000")}</div>
        <div className="mt-[8px]">
          <Badge icon={Truck} tone="primary">
            {t("fromDrivers", { n: 6 })}
          </Badge>
        </div>
      </div>
      <div className={cn(card, "px-[18px] py-[16px]")}>
        <div className="flex items-center gap-[8px] text-table text-text-secondary">
          <Icon icon={ReceiptText} />
          {t("custDebt")}
        </div>
        <div className="mt-[6px] text-[24px] leading-8 font-semibold tabular-nums">{formatMoney("412300000")}</div>
        <div className="mt-[8px]">
          <Badge icon={Clock} tone="warning">
            {t("overdue", { p: 7 })}
          </Badge>
        </div>
      </div>
      <div className={cn(card, "col-span-2 flex flex-col gap-[10px] px-[18px] py-[16px]")}>
        <div className="flex items-center gap-[8px] text-table text-text-secondary">
          <Icon icon={Clock} />
          {t("aging")}
        </div>
        <div className="flex h-[10px] gap-[2px] overflow-hidden rounded-control">
          {AGING.map((a) => (
            <div key={a.key} className={a.bar} style={{ flex: a.p }} />
          ))}
        </div>
        <div className="flex flex-wrap gap-[16px] text-caption text-text-secondary">
          {AGING.map((a) => (
            <span key={a.key}>{t(`ag.${a.key}`, { p: a.p })}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

const SCENES: Record<ShowcaseModule, () => ReactNode> = {
  orders: OrdersScene,
  stock: StockScene,
  marking: MarkingScene,
  delivery: DeliveryScene,
  money: MoneyScene,
};

/**
 * Kirish sahifasining chap paneli (O22, egasi tasdiqlagan yakuniy dizayn `docs/notes/login-100plus-yakuniy.dc.html`):
 * logotip, har modulning oʻz sahnasi va pastki karta (sarlavha, tavsif, segment-yorliqlar, pauza, 4 koʻrsatkich).
 * 6 s da almashadi; foydalanuvchi yorliqni bossa — toʻxtaydi; `prefers-reduced-motion` da avtomatik almashmaydi.
 */
export function LoginShowcase({ roles }: { roles: number | null }) {
  const t = useTranslations("login.sc");
  const reduced = usePrefersReducedMotion();
  const [active, setActive] = useState<ShowcaseModule>("orders");
  const [paused, setPaused] = useState(false);
  const running = !paused && !reduced;

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setActive((m) => nextModule(m)), SHOWCASE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [running, active]);

  const stats = [
    { value: roles === null ? "—" : String(roles), label: t("roles") },
    { value: t("langs"), label: t("langsSub") },
    { value: "FEFO", label: t("fefoSub") },
    { value: "24/7", label: t("cloudSub") },
  ];
  const Scene = SCENES[active];

  return (
    <aside className="hidden min-w-0 flex-[1_1_640px] flex-col gap-[20px] overflow-y-auto rounded-[12px] bg-primary-soft px-[32px] py-[28px] lg:flex">
      <BrandLogo />
      <div aria-hidden className="flex min-h-[400px] flex-auto flex-col items-center justify-center gap-[10px]">
        <div key={active} className="flex w-full justify-center motion-safe:animate-fade-in">
          <Scene />
        </div>
        <div className="text-caption text-text-secondary">{t("sample")}</div>
      </div>
      <section
        aria-roledescription="carousel"
        aria-label={t("modules")}
        className="flex flex-col gap-[14px] rounded-[12px] border border-border bg-surface px-[24px] py-[20px]"
      >
        <div aria-live={running ? "off" : "polite"} className="flex flex-col gap-[6px]">
          <p className="text-caption font-semibold tracking-[1.5px] text-link uppercase">{t(`m.${active}`)}</p>
          <h2 className="text-[24px] leading-8 font-semibold text-text-primary">{t(`h.${active}`)}</h2>
          <p className="text-subtitle font-normal text-text-secondary">{t(`d.${active}`)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-[4px] rounded-card bg-background p-[4px]">
          <div role="tablist" aria-label={t("modules")} className="flex flex-wrap gap-[4px]">
            {SHOWCASE_MODULES.map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={m === active}
                onClick={() => {
                  setActive(m);
                  setPaused(true);
                }}
                className={cn(
                  "flex h-[56px] min-w-[84px] flex-col items-center justify-center gap-[4px] rounded-control transition-colors duration-150 ease-out",
                  m === active
                    ? "bg-surface text-link shadow-[0_1px_2px_rgb(18_60_58/0.08)]"
                    : "text-text-secondary hover:text-text-primary",
                )}
              >
                <Icon icon={TAB_ICONS[m]} size="md" />
                <span className="text-caption font-medium">{t(`tab.${m}`)}</span>
              </button>
            ))}
          </div>
          {reduced ? null : (
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              aria-label={paused ? t("play") : t("pause")}
              title={paused ? t("play") : t("pause")}
              className="ml-auto flex size-[44px] items-center justify-center rounded-control text-text-secondary transition-colors duration-150 ease-out hover:text-text-primary"
            >
              <Icon icon={paused ? Play : Pause} size="md" />
            </button>
          )}
        </div>
        <dl className="grid grid-cols-4 gap-[12px]">
          {stats.map((s) => (
            <div key={s.label} className="flex min-w-0 flex-col-reverse">
              <dt className="truncate text-table text-text-secondary">{s.label}</dt>
              <dd className="text-[20px] leading-7 font-semibold text-text-primary tabular-nums">{s.value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </aside>
  );
}
