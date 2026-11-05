"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CircleCheck, CircleMinus, Download, Truck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState, ForbiddenState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { useMe } from "@/features/auth/session";
import { formatIsoDate } from "@/features/counterparties/api";
import { PeriodPicker, usePeriodState } from "@/features/home/period-picker";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { formatMoney } from "@/lib/format";
import { useBranchStore } from "@/lib/stores/branch";

type Row = components["schemas"]["SupplierGoodsRow"];
export type SupplierKind = components["schemas"]["SupplierGoodsView"]["kind"];

export const KIND_LABELS: Record<SupplierKind, string> = { STAFF: "Taʼminotchi xodim", COMPANY: "Taʼminotchi korxona" };

/** Hisobot ruxsati: reports.all yoki reports.view va tannarx (prices.cost) — hisobot butunlay tannarxda. */
export function canSeeSupplierGoods(perms: string[]): boolean {
  return (perms.includes("reports.all") || perms.includes("reports.view")) && perms.includes("prices.cost");
}

/** .xlsx eksport havolasi — sahifadagi filtrlar bilan. */
export function supplierGoodsExportHref(kind: SupplierKind, f: { branchId: number | null; from: string; to: string }): string {
  const p = new URLSearchParams({ kind });
  if (f.branchId != null) p.set("branchId", String(f.branchId));
  p.set("from", f.from);
  p.set("to", f.to);
  return `/api/reports/supplier-goods/export?${p.toString()}`;
}

const money = (v: string) => <span className="font-mono tabular-nums">{formatMoney(v)}</span>;

/** Taʼminotchi xodim («Kim nomiga») va korxona tovari, tannarxda: olib keldi / sotildi / boshqa / qoldi; Aktiv / Passiv. */
export function SupplierGoodsReportPage() {
  const me = useMe();
  const allowed = canSeeSupplierGoods(me.data?.permissions ?? []);
  const selectedBranch = useBranchStore((s) => s.branchId);
  const branchId = me.data?.allBranches ? (selectedBranch ?? null) : (me.data?.branchId ?? null);
  const period = usePeriodState();
  const { from, to } = period.range;
  const [kind, setKind] = useState<SupplierKind>("STAFF");
  const report = useQuery({
    queryKey: ["reports", "supplier-goods", kind, branchId, from, to],
    queryFn: () =>
      unwrap(
        api.GET("/api/reports/supplier-goods", {
          params: { query: { kind, branchId: branchId ?? undefined, from: from ?? undefined, to: to ?? undefined } },
        }),
      ),
    enabled: allowed && !!from && !!to,
  });

  if (me.data && !allowed) {
    return <ForbiddenState description="Bu hisobot tannarxda — hisobot va tannarx koʻrish ruxsati kerak." />;
  }
  const r = report.data;
  const columns: TableColumn<Row>[] = [
    { key: "name", title: kind === "STAFF" ? "Xodim (kim nomiga)" : "Taʼminotchi" },
    {
      key: "active",
      title: "Holat",
      render: (x) =>
        x.active ? (
          <Badge tone="success" icon={CircleCheck}>
            Aktiv
          </Badge>
        ) : (
          <Badge tone="neutral" icon={CircleMinus}>
            Passiv
          </Badge>
        ),
    },
    { key: "brought", title: "Olib keldi", align: "right", render: (x) => money(x.brought) },
    { key: "sold", title: "Sotildi", align: "right", render: (x) => money(x.sold) },
    { key: "other", title: "Boshqa", align: "right", render: (x) => money(x.other) },
    { key: "left", title: "Qoldi", align: "right", render: (x) => money(x.left) },
  ];
  const totals: Record<string, React.ReactNode> | undefined = r
    ? {
        name: "Jami",
        brought: money(r.total.brought),
        sold: money(r.total.sold),
        other: money(r.total.other),
        left: money(r.total.left),
      }
    : undefined;

  return (
    <>
      <Link href="/reports" className="mb-2 inline-flex items-center gap-1 text-caption text-text-secondary hover:underline">
        <ArrowLeft size={14} strokeWidth={1.5} aria-hidden /> Hisobotlar
      </Link>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-page-title">{KIND_LABELS[kind]} tovari</h1>
        <PeriodPicker state={period} />
      </div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          aria-label="Kim boʻyicha"
          items={(Object.keys(KIND_LABELS) as SupplierKind[]).map((k) => ({ key: k, label: k === "STAFF" ? "Xodim" : "Korxona" }))}
          value={kind}
          onChange={(k) => setKind(k as SupplierKind)}
        />
        <div className="flex items-center gap-4 text-caption text-text-secondary">
          {r ? (
            <span>
              {r.from === r.to ? formatIsoDate(r.from) : `${formatIsoDate(r.from)} – ${formatIsoDate(r.to)}`}
              {r.branchId == null ? " · barcha filiallar" : ""}
            </span>
          ) : null}
          {from && to ? (
            <a
              href={supplierGoodsExportHref(kind, { branchId, from, to })}
              download
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <Download size={16} strokeWidth={1.5} aria-hidden /> Excelʼga yuklab olish
            </a>
          ) : null}
        </div>
      </div>
      {report.error ? (
        <ErrorState onRetry={() => report.refetch()} />
      ) : (
        <Table
          caption={`${KIND_LABELS[kind]} tovari`}
          density="compact"
          columns={columns}
          rows={r?.rows ?? []}
          rowKey={(x) => String(x.id)}
          loading={report.isLoading}
          totals={r && r.rows.length > 0 ? totals : undefined}
          emptyState={
            <EmptyState
              icon={Truck}
              title="Davrda harakat va qoldiq yoʻq"
              description="Boshqa davrni tanlang yoki filialni oʻzgartiring."
            />
          }
        />
      )}
      <p className="mt-2 text-caption text-text-secondary">
        Tannarxda. Olib keldi — davrdagi kirim; Sotildi — sotuv − qaytarish; Boshqa — hisobdan oʻtkazish va h.k.; Qoldi — hozirgi qoldiq.
        Aktiv — davrda kirim qilgan, Passiv — kirim yoʻq, qoldigʻi bor.
      </p>
    </>
  );
}
