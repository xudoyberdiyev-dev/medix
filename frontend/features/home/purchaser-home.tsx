"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Boxes,
  CalendarClock,
  ChevronRight,
  CircleCheck,
  CirclePause,
  ClockAlert,
  FilePen,
  Gift,
  type LucideIcon,
  PackageMinus,
  PackageOpen,
  PackagePlus,
  ReceiptText,
  ShoppingCart,
  Stamp,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, ForbiddenState, Skeleton } from "@/components/ui/system-states";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { formatIsoDate, todayTashkent } from "@/features/counterparties/api";
import { useBranches } from "@/features/employees/api";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { cn } from "@/lib/cn";
import { formatMoney, formatQuantity } from "@/lib/format";
import { useBranchStore } from "@/lib/stores/branch";
import { type AttentionRow, nonZero, Panel } from "./director-home";
import { firstName, greetKey, tashkentHour } from "./director-view";

type PurchaserHomeView = components["schemas"]["PurchaserHomeView"];

/** Xaridning «Diqqat talab qiladi» qatorlari: kechikkan / bugungi / 3 kunlik YB toʻlovlari, kutayotgan kirimlar, bonus; nol boʻlganlari yashiriladi. */
export function purchaserAttentionRows(h: PurchaserHomeView): AttentionRow[] {
  const rows: AttentionRow[] = [
    { key: "s0", value: h.due.overdue, href: "/debts/suppliers", money: true, danger: true },
    { key: "s1", value: h.due.today, href: "/debts/suppliers", money: true },
    { key: "s3", value: h.due.next3Days, href: "/debts/suppliers", money: true },
    {
      key: "acc",
      value: String(h.receipts.toAccept),
      href: "/receipts?status=DRAFT",
      money: false,
    },
    {
      key: "post",
      value: String(h.receipts.toPost),
      href: "/receipts?status=ACCEPTED",
      money: false,
    },
    {
      key: "bo",
      value: String(h.bonus.pendingOverdue),
      href: "/bonuses",
      money: false,
      danger: true,
    },
  ];
  return rows.filter((r) => nonZero(r.value));
}

/** Xarid bosh sahifasi — prototip `Home.dc.html` («purchase» varianti; SPEC 2, 8): kirimlar, YB qarzi va toʻlov kunlari, bonus eslatmalari, «Oʻz nomimdagi tovar» (donada). */
export function PurchaserHome() {
  const t = useTranslations("home");
  const me = useMe();
  const branches = useBranches();
  const selectedBranch = useBranchStore((s) => s.branchId);
  const allowed = can(me.data, "receipt.create") && can(me.data, "sdebt.view");
  const branchId = me.data?.allBranches ? (selectedBranch ?? null) : (me.data?.branchId ?? null);
  const home = useQuery({
    queryKey: ["home", "purchaser", branchId],
    queryFn: () => unwrap(api.GET("/api/home/purchaser", { params: { query: { branchId: branchId ?? undefined } } })),
    enabled: allowed,
    refetchInterval: 120_000,
  });

  if (me.data && !allowed) return <ForbiddenState description={t("purchaser.forbidden")} />;
  const h = home.data;
  const name = firstName(me.data?.fullName);
  const greet = t(`dir.${greetKey(tashkentHour())}`) + (name ? `, ${name}` : "");
  const branchName = h ? (h.branchId == null ? t("dir.allBr") : ((branches.data ?? []).find((b) => b.id === h.branchId)?.name ?? "")) : "";

  return (
    <>
      <div className="mb-4 min-w-0">
        <h1 className="text-page-title">{greet}</h1>
        <p className="mt-0.5 text-body text-text-secondary">
          {formatIsoDate(h?.today ?? todayTashkent())}
          {branchName ? ` · ${branchName}` : ""}
        </p>
      </div>
      {home.error ? <ErrorState onRetry={() => home.refetch()} /> : !h ? <Skeleton className="h-40 w-full" /> : <Body h={h} />}
    </>
  );
}

interface Row {
  key: string;
  icon: LucideIcon;
  tone: string;
  text: string;
  sub?: string;
  value: string;
  href?: string;
}

/** Prototip «rows» kartasi: ikonka, matn (+ izoh), qiymat, ›. */
function Rows({ title, rows, empty }: { title: string; rows: Row[]; empty?: { title: string; hint: string } }) {
  return (
    <Panel title={title}>
      {rows.length === 0 && empty ? (
        <EmptyState icon={CircleCheck} title={empty.title} description={empty.hint} />
      ) : (
        <ul className="mx-4 mb-2 divide-y divide-border border-t border-border">
          {rows.map((r) => {
            const inner = (
              <>
                <r.icon size={16} strokeWidth={1.5} aria-hidden className={cn("shrink-0", r.tone)} />
                <span className="min-w-0 flex-1">
                  {r.text}
                  {r.sub ? <span className="block text-caption text-text-secondary">{r.sub}</span> : null}
                </span>
                <span className="shrink-0 tabular-nums">{r.value}</span>
                <ChevronRight size={16} strokeWidth={1.5} aria-hidden className="shrink-0 text-text-secondary" />
              </>
            );
            return (
              <li key={r.key}>
                {r.href ? (
                  <Link href={r.href} className="flex min-h-11 items-center gap-3 py-2 text-body hover:bg-background">
                    {inner}
                  </Link>
                ) : (
                  <div className="flex min-h-11 items-center gap-3 py-2 text-body">{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function Body({ h }: { h: PurchaserHomeView }) {
  const t = useTranslations("home.pur");
  const pcs = (n: number) => t("pcs", { n: formatQuantity(n) });
  const r = h.receipts;
  const d = h.due;
  const o = h.ownMoves;
  const g = h.ownGoods;
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Rows
        title={t("rcT")}
        rows={[
          {
            key: "acc",
            icon: PackageOpen,
            tone: "text-info",
            text: t("rcAcc"),
            sub: r.toAcceptNumbers.join(", "),
            value: String(r.toAccept),
            href: "/receipts?status=DRAFT",
          },
          {
            key: "post",
            icon: Stamp,
            tone: "text-warning",
            text: t("rcPost"),
            sub: r.toPostNumbers.join(", "),
            value: String(r.toPost),
            href: "/receipts?status=ACCEPTED",
          },
          {
            key: "mine",
            icon: FilePen,
            tone: "text-text-secondary",
            text: t("rcMine"),
            value: String(r.toAcceptMine + r.toPostMine),
            href: "/receipts",
          },
        ]}
      />
      <Rows
        title={t("debtT")}
        rows={[
          {
            key: "all",
            icon: ReceiptText,
            tone: "text-text-secondary",
            text: t("debtAll"),
            value: formatMoney(h.supplierDebt.debt),
            href: "/debts/suppliers",
          },
          {
            key: "late",
            icon: ClockAlert,
            tone: "text-danger",
            text: `${t("late")} · ${d.overdueCount}`,
            value: formatMoney(d.overdue),
            href: "/debts/suppliers",
          },
          {
            key: "today",
            icon: CalendarClock,
            tone: "text-warning",
            text: `${t("today")} · ${d.todayCount}`,
            value: formatMoney(d.today),
            href: "/debts/suppliers",
          },
          {
            key: "3d",
            icon: CalendarClock,
            tone: "text-warning",
            text: `${t("d3")} · ${d.next3Count}`,
            value: formatMoney(d.next3Days),
            href: "/debts/suppliers",
          },
        ]}
      />
      <Rows
        title={t("bonusT")}
        empty={{ title: t("bonusNone"), hint: t("bonusNoneHint") }}
        rows={h.bonusDue.map((b) => ({
          key: String(b.receiptId),
          icon: Gift,
          tone: b.date < h.today ? "text-danger" : "text-warning",
          text: `${b.supplier} · ${b.number}`,
          sub: formatIsoDate(b.date),
          value: formatMoney(b.amount),
          href: "/bonuses",
        }))}
      />
      <Rows
        title={t("ownT")}
        empty={{ title: t("ownNone"), hint: t("ownNoneHint") }}
        rows={
          o.receipts === 0
            ? []
            : [
                {
                  key: "in",
                  icon: PackagePlus,
                  tone: "text-info",
                  text: t("brought"),
                  sub: t("rcN", { n: o.receipts }),
                  value: pcs(g.broughtQty),
                  href: "/receipts",
                },
                {
                  key: "sold",
                  icon: ShoppingCart,
                  tone: "text-success",
                  text: t("sold"),
                  sub: o.lastSale ? t("lastSale", { d: formatIsoDate(o.lastSale) }) : undefined,
                  value: pcs(o.soldQty),
                },
                { key: "left", icon: Boxes, tone: "text-text-secondary", text: t("left"), value: pcs(g.leftQty), href: "/stock" },
                ...(o.otherQty
                  ? [
                      {
                        key: "other",
                        icon: PackageMinus,
                        tone: "text-warning",
                        text: t("other"),
                        sub: t("otherSub"),
                        value: pcs(o.otherQty),
                      },
                    ]
                  : []),
                {
                  key: "st",
                  icon: o.active ? CircleCheck : CirclePause,
                  tone: o.active ? "text-success" : "text-text-secondary",
                  text: o.active ? t("active") : t("passive"),
                  sub: t("activeSub"),
                  value: "",
                },
              ]
        }
      />
    </div>
  );
}
