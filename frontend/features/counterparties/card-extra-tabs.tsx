"use client";

import { ArrowUpRight, PackageOpen } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { EmptyState, ErrorState, ForbiddenState, Skeleton } from "@/components/ui/system-states";
import { ActSection } from "@/features/debts/act-section";
import { cn } from "@/lib/cn";
import { formatMoney, formatQuantity } from "@/lib/format";
import { formatIsoDate, useSupplierProducts, type CounterpartyRole } from "./api";

/** Segmentli tanlov (prototip: kulrang fon, tanlangani oq). */
function Segmented<T extends string | number>(props: {
  label: string;
  items: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={props.label} className="flex rounded-control bg-background p-0.5">
      {props.items.map((x) => (
        <button
          key={x.key}
          type="button"
          role="radio"
          aria-checked={x.key === props.value}
          onClick={() => props.onChange(x.key)}
          className={cn(
            "rounded-[6px] px-3 py-1 text-[12.5px] font-medium",
            x.key === props.value ? "bg-surface text-text-primary shadow-sm" : "text-text-secondary",
          )}
        >
          {x.label}
        </button>
      ))}
    </div>
  );
}

/** Kartochka «Akt sverka» (prototip ys_tabRecon): filial tanlovi + davr boʻyicha akt (Qarzlar sahifasidagi bilan bir xil, PDF bilan). */
export function ReconTab(props: {
  id: number;
  role: CounterpartyRole;
  branches: { branchId: number; code: string; name: string }[];
  defaultBranch: number | null;
  allowed: boolean;
}) {
  const t = useTranslations("counterparties.docs");
  const [branch, setBranch] = useState<number | null>(props.defaultBranch);
  if (!props.allowed) return <ForbiddenState description={t("forbidden")} />;
  const customers = props.role === "CUSTOMER";
  const current = branch ?? props.defaultBranch ?? props.branches[0]?.branchId ?? null;
  return (
    <section className="flex flex-col gap-4 rounded-card border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[14px] font-semibold">{t("tab.RECON")}</span>
        <div className="flex items-center gap-3">
          {props.branches.length > 1 && current != null ? (
            <Segmented
              label={t("branch")}
              items={props.branches.map((b) => ({ key: b.branchId, label: b.code }))}
              value={current}
              onChange={setBranch}
            />
          ) : null}
          <Link
            href={customers ? "/debts/customers" : "/debts/suppliers"}
            className="flex items-center gap-1 text-[12.5px] font-medium text-primary-button hover:underline"
          >
            {t("goPage")}
            <ArrowUpRight size={14} strokeWidth={1.5} aria-hidden />
          </Link>
        </div>
      </div>
      <ActSection key={current ?? 0} side={props.role} counterpartyId={props.id} branchId={current} />
    </section>
  );
}

type Period = "30" | "90" | "all";
const GRID = "grid grid-cols-[minmax(200px,1.6fr)_150px_110px_110px_90px] items-center";

/** YB kartochkasi «Mahsulotlar» (prototip tProds): davr 30 kun / 90 kun / Hammasi; Mahsulot, Oxirgi narx, Oxirgi sana, Soni, Kirimlar. */
export function ProductsTab(props: { id: number; allowed: boolean }) {
  const t = useTranslations("counterparties.docs");
  const [period, setPeriod] = useState<Period>("90");
  const q = useSupplierProducts(props.id, period === "all" ? null : Number(period), props.allowed);
  if (!props.allowed) return <ForbiddenState description={t("forbidden")} />;
  return (
    <section className="overflow-x-auto rounded-card border border-border bg-surface">
      <div className="flex min-w-[640px] items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <span className="flex items-baseline gap-3">
          <span className="text-[14px] font-semibold">{t("tab.PRODUCTS")}</span>
          {q.data && q.data.total > q.data.items.length ? (
            <span className="text-caption text-text-secondary">
              {t("lastN", { n: String(q.data.items.length), total: String(q.data.total) })}
            </span>
          ) : null}
        </span>
        <Segmented
          label={t("prod.period")}
          items={[
            { key: "30", label: t("prod.days", { n: "30" }) },
            { key: "90", label: t("prod.days", { n: "90" }) },
            { key: "all", label: t("prod.all") },
          ]}
          value={period}
          onChange={setPeriod}
        />
      </div>
      <div className="min-w-[640px]">
        <div className={`${GRID} h-[38px] border-b border-border bg-table-header text-[12px] font-medium text-text-secondary`}>
          <span className="px-4">{t("prod.product")}</span>
          <span className="px-3 text-right">{t("prod.lastPrice")}</span>
          <span className="px-3">{t("prod.lastDate")}</span>
          <span className="px-3 text-right">{t("prod.qty")}</span>
          <span className="pr-4 pl-3 text-right">{t("prod.receipts")}</span>
        </div>
        {q.isPending ? (
          <div className="flex flex-col gap-2 p-4">
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </div>
        ) : q.error ? (
          <ErrorState onRetry={() => q.refetch()} />
        ) : q.data.items.length === 0 ? (
          <EmptyState icon={PackageOpen} title={t("prod.emptyTitle")} description={t("prod.emptyDescription")} />
        ) : (
          q.data.items.map((x) => (
            <div key={x.productId} className={`${GRID} h-11 border-b border-border text-[13px] last:border-b-0`}>
              <span className="flex min-w-0 flex-col px-4">
                <Link href={`/products/${x.productId}`} className="truncate font-medium hover:underline">
                  {x.name}
                </Link>
                <span className="truncate text-[12px] leading-4 text-text-secondary">
                  {[x.code, x.manufacturer].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className="px-3 text-right tabular-nums">{x.lastPrice != null ? formatMoney(x.lastPrice) : "—"}</span>
              <span className="px-3 text-text-secondary">{formatIsoDate(x.lastDate)}</span>
              <span className="px-3 text-right font-medium tabular-nums">{formatQuantity(x.qty)}</span>
              <span className="pr-4 pl-3 text-right text-text-secondary tabular-nums">{x.receipts}</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
