"use client";

import {
  Archive,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CircleCheck,
  CircleSlash,
  Copy,
  FileText,
  Lock,
  PackageOpen,
  Pencil,
  ScanBarcode,
  ShieldAlert,
  Snowflake,
  Truck,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DocumentHeader } from "@/components/ui/document-header";
import { RowMenu } from "@/components/ui/row-menu";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/system-states";
import { Tabs } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { useDictionary, type Entry } from "@/features/dictionaries/api";
import { DeactivateDialog } from "@/features/organization/deactivate-dialog";
import { daysLeft, isDocType, moveHref } from "@/features/stock/batch-panel";
import { cn } from "@/lib/cn";
import { formatDate, formatDateTime, formatMoney, formatQuantity } from "@/lib/format";

const day = (iso: string) => formatDate(new Date(`${iso}T00:00:00+05:00`));
import { useBranchStore } from "@/lib/stores/branch";
import {
  PRODUCT_CREATE,
  useActivateProduct,
  useBulkDeactivate,
  useEmployeeOptions,
  usePriceHistory,
  useProduct,
  useProductHistory,
  useProductStockCard,
  type ProductDetail,
} from "./api";
import { historyChanges, historyKind, type HistoryKind } from "./history";

const TABS = ["general", "stock", "prices", "moves", "history"] as const;
type Tab = (typeof TABS)[number];
const SOON_DAYS = 90;
const ZONE_ICON: Record<string, [LucideIcon, string]> = {
  RECEIVING: [PackageOpen, "neutral"],
  QUARANTINE: [ShieldAlert, "warning"],
  SHIPPING: [Truck, "neutral"],
  MAIN: [Archive, "neutral"],
  COLD: [Snowflake, "info"],
  SAFE: [Lock, "danger"],
};

function InfoGrid({ title, rows }: { title: string; rows: [string, ReactNode, boolean?][] }) {
  return (
    <section className="rounded-card border border-border bg-surface shadow-[0_1px_2px_rgba(18,60,58,0.04)]">
      <h2 className="border-b border-border px-5 py-3 text-[15px] font-semibold">{title}</h2>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 px-5 py-4 sm:grid-cols-2">
        {rows.map(([label, value, mono]) => (
          <div key={label} className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-caption text-text-secondary">{label}</dt>
            <dd className={cn("text-body break-words", mono && value ? "font-mono text-[13px]" : "", value ? "" : "text-text-disabled")}>
              {value || "—"}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * Mahsulot kartochkasi (prototip `Products` → kartochka): sarlavha (Mahsulotlar / kod, nom, holat va belgilar, ishlab chiqaruvchi ·
 * kategoriya · davlat; «Tahrirlash», «…» — Nusxa olish, Nofaol/Faol qilish), yorliqlar Umumiy / Qoldiqlar / Narxlar / Harakatlar /
 * Tarix. Umumiy — maʼlumot kartalari va yon xulosa (jami qoldiq, partiyalar, eng yaqin muddat, oʻrtacha tannarx, filiallar boʻyicha).
 */
export function ProductCardPage({ id }: { id: number }) {
  const t = useTranslations("products.card");
  const tl = useTranslations("products.list");
  const product = useProduct(id);
  if (product.error) return <ErrorState error={product.error} onRetry={() => product.refetch()} />;
  if (!product.data)
    return (
      <div className="flex flex-col gap-4" aria-label={t("loading")}>
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  return <Card p={product.data} t={t} tl={tl} />;
}

function Card({
  p,
  t,
  tl,
}: {
  p: ProductDetail;
  t: ReturnType<typeof useTranslations<"products.card">>;
  tl: ReturnType<typeof useTranslations<"products.list">>;
}) {
  const tp = useTranslations("products");
  const router = useRouter();
  const me = useMe();
  const canEdit = can(me.data, PRODUCT_CREATE);
  const selectedBranch = useBranchStore((s) => s.branchId);
  const branchId = me.data?.allBranches ? (selectedBranch ?? null) : null;
  const [tab, setTab] = useState<Tab>("general");
  const [deact, setDeact] = useState(false);
  const activate = useActivateProduct();
  const deactivate = useBulkDeactivate();
  const stock = useProductStockCard(p.id, branchId);
  const s = stock.data;
  const unit = p.unit.name;
  const [now] = useState(() => Date.now());
  const nearDays = s?.nearestExpiry ? daysLeft(s.nearestExpiry, now) : null;
  const daysNote = (d: number) => (d < 0 ? t("expired") : t("daysLeft", { count: d }));

  const badges = (
    <>
      {p.active ? (
        <Badge tone="success" icon={CircleCheck}>
          {tl("active")}
        </Badge>
      ) : (
        <Badge tone="neutral" icon={CircleSlash}>
          {tl("inactive")}
        </Badge>
      )}
      {p.controlled ? (
        <Badge tone="danger" icon={Lock}>
          {tl("stCtrl")}
        </Badge>
      ) : null}
      {p.marked ? (
        <Badge tone="neutral" icon={ScanBarcode}>
          {t("stMark")}
        </Badge>
      ) : null}
      {p.prescription ? (
        <Badge tone="neutral" icon={FileText}>
          {tl("views.PRESCRIPTION")}
        </Badge>
      ) : null}
    </>
  );
  const yn = (v: boolean) => (v ? tl("yes") : t("no"));

  const kpis: { label: string; value: string; note?: string; warn?: boolean }[] = [
    { label: t("sTotal"), value: s ? `${formatQuantity(s.total)} ${unit}` : "…" },
    { label: t("sBatches"), value: s ? formatQuantity(s.batches) : "…" },
    {
      label: t("sNearest"),
      value: s?.nearestExpiry ? day(s.nearestExpiry) : "—",
      note: nearDays !== null ? daysNote(nearDays) : undefined,
      warn: nearDays !== null && nearDays <= SOON_DAYS,
    },
    ...(s && s.avgCost !== undefined && s.avgCost !== null
      ? [{ label: t("sAvgCost"), value: formatMoney(s.avgCost) }]
      : s && s.total === 0 && can(me.data, "special.cost")
        ? [{ label: t("sAvgCost"), value: "—" }]
        : []),
  ];
  const maxQ = Math.max(1, ...(s?.byBranch ?? []).map((b) => b.qty));

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <DocumentHeader
        parent={{ label: tl("title"), href: "/products" }}
        crumb={p.code}
        crumbMono
        title={p.name}
        number={p.code}
        status={<span className="flex flex-wrap items-center gap-1.5">{badges}</span>}
        sub={[p.manufacturer?.name, p.category?.name, p.country?.name].filter(Boolean).join(" · ") || undefined}
        actions={
          canEdit ? (
            <>
              <RowMenu
                label={tl("more")}
                items={[
                  {
                    key: "copy",
                    label: tl("aCopy"),
                    icon: <Copy size={16} strokeWidth={1.5} aria-hidden />,
                    onSelect: () => router.push(`/products/new?copy=${p.id}`),
                  },
                  p.active
                    ? {
                        key: "deact",
                        label: tl("aDeact"),
                        icon: <CircleSlash size={16} strokeWidth={1.5} className="text-danger" aria-hidden />,
                        onSelect: () => setDeact(true),
                      }
                    : {
                        key: "act",
                        label: tl("aAct"),
                        icon: <CircleCheck size={16} strokeWidth={1.5} aria-hidden />,
                        onSelect: () =>
                          activate.mutate(p.id, {
                            onSuccess: () => toast({ tone: "success", title: tl("activated", { name: p.name }) }),
                          }),
                      },
                ]}
              />
              <Button icon={Pencil} onClick={() => router.push(`/products/${p.id}/edit`)}>
                {tl("aEdit")}
              </Button>
            </>
          ) : (
            <Badge tone="neutral">{t("readOnly")}</Badge>
          )
        }
      />
      <Tabs
        aria-label={t("tabsLabel")}
        items={TABS.map((k) => ({ key: k, label: t(`tab.${k}`) }))}
        value={tab}
        onChange={(k) => setTab(k as Tab)}
      />

      {tab === "general" ? (
        <div className="flex flex-wrap items-start gap-6">
          <div className="flex min-w-0 flex-[1_1_480px] flex-col gap-4">
            <InfoGrid
              title={t("iBasic")}
              rows={[
                [t("lName"), p.name],
                [t("lContract"), p.contractName],
                [t("lClassifier"), p.classifierName],
                [t("lMaker"), p.manufacturer?.name],
                [t("lCountry"), p.country?.name],
                [t("lCat"), p.category?.name],
                [t("lSupply"), p.supplyEmployee?.name],
                [t("lForm"), p.dosageForm ? tp(`dosageForm.${p.dosageForm}`) : null],
                [t("lDose"), p.dose],
              ]}
            />
            <InfoGrid
              title={t("iId")}
              rows={[
                [t("lCode"), p.code, true],
                [t("lBarcodes"), p.barcodes.join(", "), true],
                [t("lIkpu"), p.ikpu, true],
                [t("lFarm"), p.farmId, true],
              ]}
            />
            <InfoGrid
              title={t("iPack")}
              rows={[
                [t("lBaseUnit"), unit],
                [t("lPack"), p.packQty ? formatQuantity(p.packQty) : null],
                [t("lPerPack"), p.perPack ? formatQuantity(p.perPack) : null],
                [t("lMinQty"), p.minQty ? formatQuantity(p.minQty) : null],
                [t("lMaxQty"), p.maxQty ? formatQuantity(p.maxQty) : tp("unlimited")],
              ]}
            />
            <InfoGrid
              title={t("iStorage")}
              rows={[
                [t("lCtrl"), yn(p.controlled)],
                [t("lMark"), p.marked ? t("required") : t("notRequired")],
                [t("lRx"), yn(p.prescription)],
              ]}
            />
            <InfoGrid title={t("iTax")} rows={[[t("lVat"), `${p.vatRate.replace(/\.00$/, "")}%`]]} />
            {p.note ? <InfoGrid title={t("iNote")} rows={[[t("lNote"), p.note]]} /> : null}
          </div>
          <aside className="flex min-w-0 flex-[0_1_320px] flex-col gap-4 rounded-card border border-border bg-surface p-5">
            {stock.error ? (
              <ErrorState onRetry={() => stock.refetch()} />
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  {kpis.map((k) => (
                    <div key={k.label} className="flex flex-col gap-0.5">
                      <span className="text-caption text-text-secondary">{k.label}</span>
                      <span
                        className={cn(
                          "text-[22px] leading-7 font-semibold tabular-nums",
                          k.warn ? "text-warning" : k.value === "—" ? "text-text-disabled" : "",
                        )}
                      >
                        {k.value}
                      </span>
                      {k.note ? (
                        <span className={cn("text-caption", k.warn ? "text-warning" : "text-text-secondary")}>{k.note}</span>
                      ) : null}
                    </div>
                  ))}
                </div>
                <div className="flex flex-col gap-2 border-t border-border pt-4">
                  <h3 className="text-caption font-medium text-text-secondary">{t("sByBranch")}</h3>
                  {(s?.byBranch ?? []).length === 0 ? (
                    <span className="text-caption text-text-disabled">{t("noStockT")}</span>
                  ) : (
                    s?.byBranch.map((b) => (
                      <div key={b.branchId} className="flex flex-col gap-1">
                        <div className="flex items-center justify-between text-[13px]">
                          <span>{b.name}</span>
                          <span className="font-medium tabular-nums">{formatQuantity(b.qty)}</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-background">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round((b.qty / maxQ) * 100)}%` }} />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </aside>
        </div>
      ) : null}

      {tab === "stock" ? <StockTab t={t} card={stock} unit={unit} productCode={p.code} /> : null}
      {tab === "prices" ? <PricesTab t={t} productId={p.id} branchId={branchId} /> : null}
      {tab === "moves" ? <MovesTab t={t} card={stock} /> : null}
      {tab === "history" ? <HistoryTab t={t} id={p.id} /> : null}
      {deact ? (
        <DeactivateDialog
          title={tl("dTitle")}
          consequence={`${s && s.total > 0 ? `${tl("dKeep")}. ` : ""}${tl("dNoNew")}.`}
          actionLabel={tl("dConfirm")}
          pending={deactivate.isPending}
          error={deactivate.error}
          onConfirm={(reason) =>
            deactivate.mutate(
              { ids: [p.id], reason },
              {
                onSuccess: () => {
                  toast({ tone: "success", title: tl("deactivated", { count: "1" }) });
                  setDeact(false);
                },
              },
            )
          }
          onClose={() => setDeact(false)}
        />
      ) : null}
    </div>
  );
}

type CardT = ReturnType<typeof useTranslations<"products.card">>;
type StockQuery = ReturnType<typeof useProductStockCard>;

function StockTab({ t, card, unit, productCode }: { t: CardT; card: StockQuery; unit: string; productCode: string }) {
  const [now] = useState(() => Date.now());
  if (card.error) return <ErrorState error={card.error} onRetry={() => card.refetch()} />;
  if (!card.data) return <Skeleton className="h-64 w-full" />;
  const lines = card.data.lines;
  if (lines.length === 0) return <EmptyState icon={PackageOpen} title={t("noStockT")} description={t("noStock")} />;
  const showCost = lines.some((l) => l.cost !== null && l.cost !== undefined);
  const groups = [...new Set(lines.map((l) => l.branchId))].map((b) => lines.filter((l) => l.branchId === b));
  const grid = showCost
    ? "grid-cols-[minmax(0,1.2fr)_150px_130px_130px_110px_100px_90px_100px]"
    : "grid-cols-[minmax(0,1.2fr)_150px_130px_130px_100px_90px_100px]";
  return (
    <div className="overflow-x-auto rounded-card border border-border bg-surface">
      <div className="min-w-[940px] text-[13px] leading-[18px]">
        <div
          className={cn(
            "grid h-[38px] items-center border-b border-border bg-table-header text-caption font-medium text-text-secondary",
            grid,
          )}
        >
          <span className="px-4">{t("qWh")}</span>
          <span className="px-3">{t("qZone")}</span>
          <span className="px-3">{t("qBatch")}</span>
          <span className="px-3">{t("qExp")}</span>
          {showCost ? <span className="px-3 text-right">{t("qCost")}</span> : null}
          <span className="px-3 text-right">{t("qQty")}</span>
          <span className="px-3 text-right">{t("qReserved")}</span>
          <span className="pr-4 pl-3 text-right">{t("qAvail")}</span>
        </div>
        {groups.map((rows) => (
          <div key={rows[0].branchId}>
            <div className="flex h-9 items-center justify-between gap-3 border-b border-border bg-table-header px-4">
              <span className="font-semibold">{rows[0].branch}</span>
              <span className="text-text-secondary">
                {t("qTotal")}: {formatQuantity(rows.reduce((a, r) => a + r.qty, 0))} {unit} · {t("qAvail")}:{" "}
                {formatQuantity(rows.reduce((a, r) => a + r.available, 0))} {unit}
              </span>
            </div>
            {rows.map((r) => {
              const [ZI, tone] = ZONE_ICON[r.zoneType] ?? ZONE_ICON.MAIN;
              const d = daysLeft(r.expiryDate, now);
              return (
                <div
                  key={`${r.batchId}-${r.zone}-${r.warehouse}`}
                  className={cn("grid min-h-11 items-center border-b border-border", grid)}
                >
                  <span className="px-4">{r.warehouse}</span>
                  <span className="flex px-3">
                    <Badge tone={tone as "neutral"} icon={ZI}>
                      {r.zone}
                    </Badge>
                  </span>
                  <span className="px-3 font-mono text-[12.5px]">{r.batch}</span>
                  <span className="flex flex-col px-3">
                    <span>{day(r.expiryDate)}</span>
                    {d <= SOON_DAYS ? (
                      <span className={cn("text-caption", d < 0 ? "text-danger" : "text-warning")}>
                        {d < 0 ? t("expired") : t("daysLeft", { count: d })}
                      </span>
                    ) : null}
                  </span>
                  {showCost ? <span className="px-3 text-right tabular-nums">{r.cost ? formatMoney(r.cost) : "—"}</span> : null}
                  <span className="px-3 text-right font-medium tabular-nums">{formatQuantity(r.qty)}</span>
                  <span className="px-3 text-right text-text-secondary tabular-nums">{formatQuantity(r.reserved)}</span>
                  <span className={cn("pr-4 pl-3 text-right font-medium tabular-nums", r.available ? "" : "text-text-disabled")}>
                    {formatQuantity(r.available)}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
        <div className="flex h-12 items-center px-4">
          <Link
            href={`/stock?q=${encodeURIComponent(productCode)}`}
            className="flex items-center gap-1.5 font-medium text-primary-button hover:underline"
          >
            {t("qOpen")}
            <ArrowRight size={16} strokeWidth={1.5} aria-hidden />
          </Link>
        </div>
      </div>
    </div>
  );
}

function PricesTab({ t, productId, branchId }: { t: CardT; productId: number; branchId: number | null }) {
  const h = usePriceHistory(productId, branchId);
  if (h.error) return <ErrorState error={h.error} onRetry={() => h.refetch()} />;
  if (!h.data) return <Skeleton className="h-48 w-full" />;
  const rows = h.data.rows;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-text-secondary">
        {t("prInfo")} · {h.data.priceTypeName}
      </p>
      {rows.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={t("prEmpty")}
          description={t("prInfo")}
          action={
            <Link href={`/prices`} className="font-medium text-primary-button hover:underline">
              {t("prSet")}
            </Link>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-surface">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead className="bg-table-header text-caption text-text-secondary">
              <tr className="h-[38px] border-b border-border">
                <th className="px-4 text-left font-medium">{t("prDate")}</th>
                <th className="px-3 text-right font-medium">{t("prPrice")}</th>
                <th className="px-3 text-right font-medium">{t("prChange")}</th>
                <th className="px-3 text-left font-medium">{t("prDoc")}</th>
                <th className="px-4 text-left font-medium">{t("prBy")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const pct = r.changePct ? Number(r.changePct) : 0;
                return (
                  <tr
                    key={`${r.priceChangeId}-${r.effectiveFrom}`}
                    className={cn("h-11 border-b border-border", r.current && "bg-primary-soft")}
                  >
                    <td className="px-4">
                      <span className="flex items-center gap-2">
                        {day(r.effectiveFrom)}
                        {r.current ? <Badge tone="success">{t("prCurrent")}</Badge> : null}
                        {r.future ? <Badge tone="info">{t("prFuture")}</Badge> : null}
                      </span>
                    </td>
                    <td className="px-3 text-right font-medium tabular-nums">{formatMoney(r.amount)}</td>
                    <td
                      className={cn(
                        "px-3 text-right tabular-nums",
                        pct > 0 ? "text-success" : pct < 0 ? "text-danger" : "text-text-secondary",
                      )}
                    >
                      {r.changePct ? (
                        <span className="inline-flex items-center gap-1">
                          {pct > 0 ? <ArrowUp size={14} strokeWidth={1.5} aria-hidden /> : null}
                          {pct < 0 ? <ArrowDown size={14} strokeWidth={1.5} aria-hidden /> : null}
                          {`${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct).toFixed(1).replace(".", ",")}%`}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3">
                      <Link href={`/prices/changes/${r.priceChangeId}`} className="font-mono text-primary-button hover:underline">
                        {r.priceChangeNumber}
                      </Link>
                    </td>
                    <td className="px-4 text-text-secondary">{r.employee ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MovesTab({ t, card }: { t: CardT; card: StockQuery }) {
  const ts = useTranslations("stock");
  if (card.error) return <ErrorState error={card.error} onRetry={() => card.refetch()} />;
  if (!card.data) return <Skeleton className="h-64 w-full" />;
  const moves = card.data.moves;
  if (moves.length === 0) return <EmptyState icon={ArrowRight} title={t("noMovesT")} description={t("noStock")} />;
  return (
    <div className="overflow-x-auto rounded-card border border-border bg-surface">
      <table className="w-full min-w-[900px] text-[13px]">
        <thead className="bg-table-header text-caption text-text-secondary">
          <tr className="h-[38px] border-b border-border">
            <th className="px-4 text-left font-medium">{t("mDate")}</th>
            <th className="px-3 text-left font-medium">{t("mDoc")}</th>
            <th className="px-3 text-left font-medium">{t("mBranch")}</th>
            <th className="px-3 text-left font-medium">{t("mWh")}</th>
            <th className="px-3 text-right font-medium">{t("mIn")}</th>
            <th className="px-3 text-right font-medium">{t("mOut")}</th>
            <th className="px-4 text-right font-medium">{t("mBal")}</th>
          </tr>
        </thead>
        <tbody>
          {moves.map((m, i) => {
            const href = moveHref(m.docType, m.docId);
            return (
              <tr key={`${m.docType}-${m.docId}-${m.warehouse}-${i}`} className="h-11 border-b border-border">
                <td className="px-4 whitespace-nowrap">{formatDateTime(new Date(m.at))}</td>
                <td className="px-3">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-text-secondary">{isDocType(m.docType) ? ts(`ov.bp.doc_${m.docType}`) : m.docType}</span>
                    {href ? (
                      <Link href={href} className="font-mono text-primary-button hover:underline">
                        {m.docNumber}
                      </Link>
                    ) : (
                      <span className="font-mono">{m.docNumber}</span>
                    )}
                  </span>
                </td>
                <td className="px-3 text-text-secondary">{m.branch}</td>
                <td className="truncate px-3">{m.warehouse}</td>
                <td className="px-3 text-right font-medium text-success tabular-nums">{m.in ? `+${formatQuantity(m.in)}` : ""}</td>
                <td className="px-3 text-right tabular-nums">{m.out ? `−${formatQuantity(m.out)}` : ""}</td>
                <td className="px-4 text-right font-medium tabular-nums">{formatQuantity(m.balance)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function HistoryTab({ t, id }: { t: CardT; id: number }) {
  const tp = useTranslations("products");
  const h = useProductHistory(id);
  const [kind, setKind] = useState<HistoryKind | "all">("all");
  const dicts: Record<string, Entry[] | undefined> = {
    manufacturerId: useDictionary("MANUFACTURER").data,
    categoryId: useDictionary("CATEGORY").data,
    countryId: useDictionary("COUNTRY").data,
    unitId: useDictionary("UNIT").data,
  };
  const employees = useEmployeeOptions().data;
  if (h.error) return <ErrorState error={h.error} onRetry={() => h.refetch()} />;
  if (!h.data) return <Skeleton className="h-48 w-full" />;
  const name = (field: string, v: unknown): string => {
    if (v === null || v === undefined || v === "") return "";
    if (typeof v === "boolean") return v ? t("yesL") : t("no");
    if (Array.isArray(v)) return v.join(", ");
    if (field === "supplyEmployeeId") return employees?.find((e) => e.id === v)?.fullName ?? `#${String(v)}`;
    if (field === "dosageForm") return tp(`dosageForm.${String(v) as "TABLET"}`);
    const d = dicts[field];
    if (d) return d.find((e) => e.id === v)?.name ?? `#${String(v)}`;
    return String(v);
  };
  const items = h.data.filter((r) => kind === "all" || historyKind(r.action) === kind);
  return (
    <div className="flex flex-col gap-4 rounded-card border border-border bg-surface px-6 py-5">
      <div className="flex flex-wrap gap-2" role="group" aria-label={t("tab.history")}>
        {(["all", "create", "change", "status"] as const).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={kind === k}
            onClick={() => setKind(k)}
            className={cn(
              "h-7 rounded-full border px-3 text-[13px]",
              kind === k ? "border-primary bg-primary-soft font-medium text-primary" : "border-border hover:bg-table-header",
            )}
          >
            {t(`h.${k}`)}
          </button>
        ))}
      </div>
      {items.length === 0 ? (
        <p className="text-text-disabled">{t("hEmpty")}</p>
      ) : (
        <ol className="flex flex-col gap-4">
          {items.map((r, i) => {
            const changes = historyChanges(r.oldValue, r.newValue);
            return (
              <li key={`${r.at}-${i}`} className="flex gap-3">
                <span className="mt-0.5 flex size-7 flex-none items-center justify-center rounded-full bg-primary-soft text-caption font-semibold text-primary">
                  {(r.employee ?? "—")
                    .split(" ")
                    .map((w) => w[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </span>
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-baseline gap-x-1.5 text-[13px]">
                    <span className="font-medium">{r.employee ?? t("system")}</span>
                    <span>
                      {t(
                        `a.${historyKind(r.action) === "status" ? "status" : r.action === "product.codeChange" ? "code" : historyKind(r.action)}`,
                      )}
                    </span>
                    {r.reason ? <span className="text-text-secondary">· {r.reason}</span> : null}
                    <span className="text-caption text-text-secondary tabular-nums">{formatDateTime(new Date(r.at))}</span>
                  </div>
                  {changes.length && r.action !== "product.create" ? (
                    <ul className="flex flex-col gap-0.5 text-caption text-text-secondary">
                      {changes.map((c) => {
                        const from = name(c.field, c.from);
                        return (
                          <li key={c.field}>
                            <span className="text-text-primary">
                              {t.has(`f.${c.field}` as "f.name") ? t(`f.${c.field}` as "f.name") : c.field}
                            </span>
                            : {from ? <span className="line-through">{from}</span> : null}
                            {from ? " → " : ""}
                            <span className="text-text-primary">{name(c.field, c.to) || "—"}</span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
