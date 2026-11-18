"use client";

import {
  Barcode,
  ChartLine,
  Check,
  MessageSquare,
  Pause,
  Play,
  ShoppingCart,
  Truck,
  Wallet,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { formatQuantity } from "@/lib/format";
import { BrandMark } from "./auth-shell";

export const SHOWCASE_MODULES = ["orders", "stock", "marking", "delivery", "money", "reports", "messages"] as const;
export type ShowcaseModule = (typeof SHOWCASE_MODULES)[number];

const MODULE_ICONS: Record<ShowcaseModule, LucideIcon> = {
  orders: ShoppingCart,
  stock: Warehouse,
  marking: Barcode,
  delivery: Truck,
  money: Wallet,
  reports: ChartLine,
  messages: MessageSquare,
};

/** Karta almashish oraligʻi (egasi: har 6 s). */
export const SHOWCASE_INTERVAL_MS = 6000;

/** Keyingi modul (aylanma). */
export function nextModule(m: ShowcaseModule): ShowcaseModule {
  return SHOWCASE_MODULES[(SHOWCASE_MODULES.indexOf(m) + 1) % SHOWCASE_MODULES.length];
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

/** Namuna buyurtma qatorlari (illyustratsiya — haqiqiy maʼlumot emas). */
const SAMPLE_LINES = [
  { name: "Paratsetamol 500 mg №10", qty: 120, price: 5432 },
  { name: "Amoksitsillin 500 mg №16", qty: 60, price: 21168 },
  { name: "Omeprazol 20 mg №30", qty: 40, price: 26208 },
];
const SAMPLE_DISCOUNT = 89107;
const SAMPLE_PICK = [
  { place: "A-01-2", name: "Paratsetamol", qty: 120, done: true },
  { place: "A-03-1", name: "Amoksitsillin", qty: 60, done: false },
  { place: "B-02-4", name: "Omeprazol", qty: 40, done: false },
];

function Illustration() {
  const t = useTranslations("login.sc");
  const subtotal = SAMPLE_LINES.reduce((s, l) => s + l.qty * l.price, 0);
  return (
    <div aria-hidden className="relative mx-auto h-[360px] w-full max-w-[600px] select-none">
      {/* Brauzer oynasi — buyurtma */}
      <div className="absolute top-[24px] right-0 w-[86%] overflow-hidden rounded-[16px] border border-border bg-surface shadow-overlay">
        <div className="flex h-[34px] items-center gap-[6px] border-b border-border bg-table-header px-[12px] text-caption text-text-secondary">
          <span className="size-[10px] rounded-full bg-danger/70" />
          <span className="size-[10px] rounded-full bg-warning/70" />
          <span className="size-[10px] rounded-full bg-success/70" />
          <span className="ml-[6px] truncate">{t("winTitle")}</span>
          <span className="ml-auto shrink-0 rounded-full bg-primary-soft px-[8px] py-[2px] text-[11px] text-link">{t("sample")}</span>
        </div>
        <div className="py-[12px] pr-[16px] pl-[30%] text-[12.5px] leading-[18px]">
          <div className="mb-[6px] flex items-center justify-between gap-[8px]">
            <b className="truncate text-[15px] text-text-primary">{t("customer")}</b>
            <span className="shrink-0 rounded-full bg-primary-soft px-[8px] py-[2px] text-[11px] text-link">{t("zone")}</span>
          </div>
          {SAMPLE_LINES.map((l) => (
            <div key={l.name} className="flex justify-between gap-[8px] border-b border-border py-[6px] text-text-primary">
              <span className="truncate">{l.name}</span>
              <span className="shrink-0 text-text-secondary tabular-nums">
                {l.qty} × {formatQuantity(l.price)}
              </span>
              <b className="shrink-0 tabular-nums">{formatQuantity(l.qty * l.price)}</b>
            </div>
          ))}
          <div className="flex justify-between border-b border-border py-[6px] text-link">
            <span>{t("discount")}</span>
            <b className="tabular-nums">−{formatQuantity(SAMPLE_DISCOUNT)}</b>
          </div>
          <div className="flex justify-between py-[6px] text-[15px] text-text-primary">
            <span>{t("total")}</span>
            <b className="tabular-nums">
              {formatQuantity(subtotal - SAMPLE_DISCOUNT)} {t("sum")}
            </b>
          </div>
          <div className="mt-[4px] flex flex-wrap gap-x-[16px] gap-y-[2px] text-caption text-text-secondary">
            <span>
              {t("payment")} <b className="text-text-primary">{t("paymentV")}</b>
            </span>
            <span>
              {t("marking")} <b className="text-text-primary">{t("markingV")}</b>
            </span>
          </div>
        </div>
      </div>
      {/* Telefon — Yigʻuvchi paneli */}
      <div className="absolute bottom-0 left-0 w-[190px] rounded-[28px] border-[7px] border-text-primary bg-surface px-[10px] py-[12px] text-[11.5px] leading-[15px] text-text-primary shadow-overlay">
        <div className="flex justify-between font-semibold">
          <span className="tabular-nums">10:24</span>
          <span>{t("picker")}</span>
        </div>
        <div className="mt-[8px] font-semibold">BY-TSH-000355</div>
        <div className="text-[11px] text-text-secondary">{t("left")}</div>
        {SAMPLE_PICK.map((p) => (
          <div key={p.place} className="mt-[7px] rounded-[10px] border border-border px-[8px] py-[7px]">
            <div className="truncate">
              {p.place} · {p.name}
            </div>
            <div className="flex items-center gap-[4px] font-semibold">
              {t("packs", { n: p.qty })}
              {p.done ? <Check size={12} strokeWidth={2} className="text-success" /> : null}
            </div>
          </div>
        ))}
        <div className="mt-[9px] rounded-[10px] bg-primary-button py-[8px] text-center font-semibold text-white">{t("finish")}</div>
      </div>
      {/* Holat belgisi */}
      <div className="absolute right-[48px] bottom-[28px] flex items-center gap-[6px] rounded-full bg-surface px-[14px] py-[7px] text-caption text-text-primary shadow-overlay">
        <span className="size-[8px] rounded-full bg-success" />
        {t("shipped")}
      </div>
    </div>
  );
}

/**
 * Kirish sahifasining chap paneli (O20, egasi tanlagan A maket): logotip, tizim illyustratsiyasi (HTML, tokenlar bilan) va pastda
 * modul kartasi — har 6 s da almashadi (pauza tugmasi; `prefers-reduced-motion` da harakatsiz).
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

  return (
    <aside
      className="relative hidden h-full w-1/2 flex-none flex-col overflow-hidden rounded-[24px] bg-primary-soft p-[28px] lg:flex"
      style={{
        backgroundImage:
          "linear-gradient(color-mix(in srgb, var(--color-primary) 7%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--color-primary) 7%, transparent) 1px, transparent 1px)",
        backgroundSize: "44px 44px",
      }}
    >
      <BrandMark size="lg" />
      <div className="flex min-h-0 flex-1 items-center px-[8px] py-[24px]">
        <Illustration />
      </div>
      <section aria-roledescription="carousel" aria-label={t("modules")} className="rounded-[18px] bg-surface px-[26px] py-[22px]">
        <div aria-live={running ? "off" : "polite"}>
          <p className="text-caption font-semibold tracking-[0.16em] text-link uppercase">{t(`m.${active}`)}</p>
          <h2 className="mt-[6px] mb-[14px] min-h-[72px] text-[28px] leading-9 font-semibold tracking-[-0.01em] text-pretty text-text-primary">
            {t(`h.${active}`)}
          </h2>
        </div>
        <div className="flex items-center gap-[6px] border-b border-border pb-[14px]">
          <div role="tablist" aria-label={t("modules")} className="flex gap-[6px]">
            {SHOWCASE_MODULES.map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={m === active}
                aria-label={t(`m.${m}`)}
                title={t(`m.${m}`)}
                onClick={() => setActive(m)}
                className={cn(
                  "flex size-[42px] items-center justify-center rounded-[10px] transition-colors duration-150 ease-out",
                  m === active ? "bg-primary-soft text-link" : "text-text-secondary hover:bg-table-header hover:text-text-primary",
                )}
              >
                <Icon icon={MODULE_ICONS[m]} size="md" />
              </button>
            ))}
          </div>
          {reduced ? null : (
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              aria-label={paused ? t("play") : t("pause")}
              title={paused ? t("play") : t("pause")}
              className="ml-auto flex size-[42px] items-center justify-center rounded-[10px] text-text-secondary transition-colors duration-150 ease-out hover:bg-table-header hover:text-text-primary"
            >
              <Icon icon={paused ? Play : Pause} size="md" />
            </button>
          )}
        </div>
        <dl className="mt-[14px] grid grid-cols-4 gap-[12px]">
          {stats.map((s) => (
            <div key={s.label} className="flex min-w-0 flex-col-reverse">
              <dt className="truncate text-table text-text-secondary">{s.label}</dt>
              <dd className="text-[24px] leading-8 font-semibold text-text-primary tabular-nums">{s.value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </aside>
  );
}
