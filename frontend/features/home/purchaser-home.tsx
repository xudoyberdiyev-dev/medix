"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronRight, Gift, HandCoins, PackageCheck, PackageOpen } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState, ForbiddenState, Skeleton } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { formatIsoDate } from "@/features/counterparties/api";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { formatMoney } from "@/lib/format";
import { useBranchStore } from "@/lib/stores/branch";
import { type AttentionRow, CardTitle, nonZero } from "./director-home";

type PurchaserHomeView = components["schemas"]["PurchaserHomeView"];
type Debtor = components["schemas"]["Debtor"];

const money = (v: string) => <span className="font-mono tabular-nums">{formatMoney(v)}</span>;

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

/** Xarid bosh sahifasi (SPEC 2, 8): kirimlar, YB qarzi va toʻlov kunlari, bonus, «Oʻz nomimdagi tovar». Tannarx koʻrsatilmaydi. */
export function PurchaserHome() {
  const t = useTranslations("home");
  const me = useMe();
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

  return (
    <>
      <h1 className="mb-4 text-page-title">{t("title")}</h1>
      {home.error ? (
        <ErrorState onRetry={() => home.refetch()} />
      ) : !h ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="flex flex-col gap-6">
          <p className="text-caption text-text-secondary">
            {formatIsoDate(h.today)}
            {h.branchId == null ? ` · ${t("allBranches")}` : ""}
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardTitle icon={PackageCheck} title={t("purchaser.pendingReceipts")} />
              <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-body">
                <dt>{t("purchaser.toAccept")}</dt>
                <dd className="text-right font-mono tabular-nums">{h.receipts.toAccept}</dd>
                <dt>{t("purchaser.toPost")}</dt>
                <dd className="text-right font-mono tabular-nums">{h.receipts.toPost}</dd>
              </dl>
              <div className="mt-2 text-caption text-text-secondary">
                {t("purchaser.mine", { accept: h.receipts.toAcceptMine, post: h.receipts.toPostMine })}
              </div>
              <Link href="/receipts" className="mt-2 inline-block text-caption text-primary-button hover:underline">
                {t("purchaser.openReceipts")}
              </Link>
            </Card>
            <Card>
              <CardTitle icon={HandCoins} title={t("card.supplierDebt")} />
              <div className="mt-1 font-mono text-subtitle tabular-nums">{formatMoney(h.supplierDebt.debt)}</div>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 text-caption text-text-secondary">
                <dt>{t("card.overdue")}</dt>
                <dd className={`text-right font-mono tabular-nums ${nonZero(h.supplierDebt.overdue) ? "text-danger" : ""}`}>
                  {formatMoney(h.supplierDebt.overdue)}
                </dd>
                <dt>{t("card.advance")}</dt>
                <dd className="text-right font-mono tabular-nums">{formatMoney(h.supplierDebt.advance)}</dd>
              </dl>
              <Link href="/debts/suppliers" className="mt-2 inline-block text-caption text-primary-button hover:underline">
                {t("card.openDebts")}
              </Link>
            </Card>
            <Card>
              <CardTitle icon={Gift} title={t("purchaser.bonusBalance")} />
              <div className="mt-1 font-mono text-subtitle tabular-nums">{formatMoney(h.bonus.balance)}</div>
              <div className="mt-2 text-caption text-text-secondary">{t("purchaser.bonusPending", { count: h.bonus.pending })}</div>
              <Link href="/bonuses" className="mt-2 inline-block text-caption text-primary-button hover:underline">
                {t("purchaser.openBonuses")}
              </Link>
            </Card>
            <Card>
              <CardTitle icon={PackageOpen} title={t("purchaser.ownGoods")} />
              <div className="mt-1 font-mono text-subtitle tabular-nums">{t("purchaser.units", { count: h.ownGoods.leftQty })}</div>
              <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 text-caption text-text-secondary">
                <dt>{t("purchaser.products")}</dt>
                <dd className="text-right font-mono tabular-nums">{h.ownGoods.products}</dd>
                <dt>{t("purchaser.brought")}</dt>
                <dd className="text-right font-mono tabular-nums">{h.ownGoods.broughtQty}</dd>
                <dt>{t("purchaser.expiring90")}</dt>
                <dd className={`text-right font-mono tabular-nums ${h.ownGoods.expiring90 > 0 ? "text-warning" : ""}`}>
                  {t("purchaser.batches", { count: h.ownGoods.expiring90 })}
                </dd>
              </dl>
            </Card>
          </div>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <PurchaserAttention home={h} />
            <TopSuppliers rows={h.topSuppliers} />
          </div>
        </div>
      )}
    </>
  );
}

function PurchaserAttention({ home }: { home: PurchaserHomeView }) {
  const t = useTranslations("home.attention");
  const rows = purchaserAttentionRows(home);
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 text-subtitle">
        <AlertTriangle size={18} strokeWidth={1.5} aria-hidden /> {t("title")}
      </h2>
      <Card flush>
        {rows.length === 0 ? (
          <EmptyState icon={AlertTriangle} title={t("allGood")} description={t("purchaserEmpty")} />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.key}>
                <Link href={r.href} className="flex items-center justify-between gap-3 px-4 py-2.5 text-body hover:bg-background">
                  <span className={r.danger ? "text-danger" : ""}>{t(`rows.${r.key}`, r.values)}</span>
                  <span className="flex items-center gap-2">
                    {r.money ? money(r.value) : <span className="font-mono tabular-nums">{r.value}</span>}
                    <ChevronRight size={16} strokeWidth={1.5} aria-hidden className="text-text-secondary" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}

function TopSuppliers({ rows }: { rows: Debtor[] }) {
  const t = useTranslations("home");
  const columns: TableColumn<Debtor>[] = [
    { key: "name", title: t("purchaser.supplier"), wrap: true },
    { key: "debt", title: t("purchaser.debt"), align: "right", render: (d) => money(d.debt) },
    {
      key: "overdue",
      title: t("card.overdue"),
      align: "right",
      render: (d) => <span className={nonZero(d.overdue) ? "text-danger" : ""}>{money(d.overdue)}</span>,
    },
  ];
  return (
    <section>
      <h2 className="mb-2 text-subtitle">{t("purchaser.topDebt")}</h2>
      <Table
        caption={t("purchaser.topDebtCaption")}
        density="compact"
        columns={columns}
        rows={rows}
        rowKey={(d) => String(d.id)}
        emptyState={<EmptyState icon={HandCoins} title={t("purchaser.noDebt")} description={t("purchaser.noDebtHint")} />}
      />
    </section>
  );
}
