"use client";

import { useQuery } from "@tanstack/react-query";
import { AlarmClock, CalendarX, Clock, LayoutDashboard, PackageOpen, Tag, Timer, Truck } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, type TableColumn } from "@/components/ui/table";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import { EmptyState, ErrorState, ForbiddenState, Skeleton } from "@/components/ui/system-states";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { formatIsoDate } from "@/features/counterparties/api";
import { formatQuantity } from "@/lib/format";
import { useBranchStore } from "@/lib/stores/branch";
import { ReceiptDrawer } from "@/features/receipts/receipt-drawer";
import { RECEIPT_ACCEPT, useReceipts, type ReceiptSummary } from "@/features/receipts/api";
import { STATUS_LABELS, type OrderStatus } from "./api";
import { IssuesList } from "./issues";
import { ReturnsList } from "./returns";
import { OrderDrawer } from "./order-drawer";
import { timerText } from "./picking-page";

export type MonitorCard = components["schemas"]["MonitorCard"];

export const MONITOR_COLUMNS: OrderStatus[] = ["QUEUED", "PICKING", "MARKING", "CHECKING", "DOCUMENTING", "LOADING"];

/** Holatda turgan vaqt: «45 daqiqa», «3 soat 10 daqiqa», «2 kun 4 soat». */
export function sinceText(since: Date, now: Date): string {
  const min = Math.max(0, Math.floor((now.getTime() - since.getTime()) / 60000));
  if (min < 60) return `${min} daqiqa`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} soat ${min % 60} daqiqa`;
  return `${Math.floor(h / 24)} kun ${h % 24} soat`;
}

/** Ustunlarga ajratish: kechikkanlar tepada, keyin eng uzoq kutayotganlar. */
export function groupByStage(cards: MonitorCard[]): Record<OrderStatus, MonitorCard[]> {
  const out = Object.fromEntries(MONITOR_COLUMNS.map((s) => [s, [] as MonitorCard[]])) as Record<OrderStatus, MonitorCard[]>;
  for (const c of cards) out[c.status]?.push(c);
  for (const s of MONITOR_COLUMNS) {
    out[s].sort((a, b) => Number(b.late) - Number(a.late) || Number(b.stale) - Number(a.stale) || a.since.localeCompare(b.since));
  }
  return out;
}

function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export type KeeperTab = "monitor" | "time" | "issues" | "receipts" | "returns";

/** Ombor mudiri paneli yorliqlari (SPEC 3): ruxsat boʻyicha; «Hujjatlashtirish» — Joʻnatish sahifasiga havola. */
export function keeperTabs(opts: { waitingTime: number; receipts: boolean; returns: boolean; receiptCount?: number }): TabItem[] {
  return [
    { key: "monitor", label: "Monitor" },
    { key: "time", label: "Vaqt berish", count: opts.waitingTime },
    { key: "issues", label: "Muammolar" },
    ...(opts.receipts ? [{ key: "receipts", label: "Kirim qabuli", count: opts.receiptCount }] : []),
    ...(opts.returns ? [{ key: "returns", label: "Qaytgan tovar" }] : []),
  ];
}

/** Ombor mudiri paneli (SPEC 3, 5.4): «Ombor holati» + yorliqlar — Monitor, Vaqt berish, Muammolar, Kirim qabuli, Qaytgan tovar. */
export function MonitorPage() {
  const me = useMe();
  const now = useNow();
  const allowed = can(me.data, "orders.queue");
  const selectedBranch = useBranchStore((s) => s.branchId);
  const branchId = me.data?.allBranches ? (selectedBranch ?? null) : null;
  const [open, setOpen] = useState<number | null>(null);
  const [receipt, setReceipt] = useState<number | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const canReceipts = can(me.data, RECEIPT_ACCEPT);
  const canReturns = can(me.data, "orders.check");
  const drafts = useReceipts(branchId, "DRAFT", 1, allowed && canReceipts);
  const rawTab = useSearchParams().get("tab");
  const board = useQuery({
    queryKey: ["orders", "monitor", branchId],
    queryFn: () => unwrap(api.GET("/api/orders/monitor", { params: { query: { branchId: branchId ?? undefined } } })),
    enabled: allowed,
    refetchInterval: 10_000,
  });

  if (me.data && !allowed) return <ForbiddenState description="Monitor Ombor mudiri, Filial rahbari va Direktor uchun." />;

  const tabs = keeperTabs({
    waitingTime: board.data?.waitingTime ?? 0,
    receipts: canReceipts,
    returns: canReturns,
    receiptCount: canReceipts ? drafts.data?.total : undefined,
  });
  const tab = (tabs.some((t) => t.key === rawTab) ? rawTab : "monitor") as KeeperTab;
  const setTab = (k: string) => router.replace(k === "monitor" ? pathname : `${pathname}?tab=${k}`, { scroll: false });
  const waiting = (board.data?.cards ?? []).filter((c) => c.status === "QUEUED" && !c.timeGiven);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-page-title">Ombor mudiri paneli</h1>
        {can(me.data, "shipments.view") ? (
          <Link
            href="/shipments"
            className="inline-flex h-control-md items-center gap-2 rounded-control border border-border bg-surface px-3 hover:border-primary"
          >
            <Truck size={16} strokeWidth={1.5} aria-hidden /> Hujjatlashtirish va reys
          </Link>
        ) : null}
      </div>
      {board.error ? (
        <ErrorState onRetry={() => board.refetch()} />
      ) : board.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          <section aria-label="Ombor holati" className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Ishda" value={board.data.cards.length} icon={LayoutDashboard} />
            <Stat
              label="Vaqt berilmagan"
              value={board.data.waitingTime}
              icon={Clock}
              tone={board.data.waitingTime ? "warning" : undefined}
            />
            <Stat label="Berilgan vaqtdan oʻtgan" value={board.data.late} icon={AlarmClock} tone={board.data.late ? "danger" : undefined} />
            <Stat
              label={`${board.data.lateDays} kundan oshgan`}
              value={board.data.stale}
              icon={CalendarX}
              tone={board.data.stale ? "danger" : undefined}
            />
          </section>
          <div className="mb-4">
            <Tabs items={tabs} value={tab} onChange={setTab} aria-label="Ombor mudiri paneli" />
          </div>
          {tab !== "monitor" ? null : board.data.cards.length === 0 ? (
            <Card>
              <EmptyState
                icon={LayoutDashboard}
                title="Omborda ish yoʻq"
                description="Tasdiqlangan buyurtmalar «Navbatda» ustunida paydo boʻladi."
              />
            </Card>
          ) : (
            <div className="grid grid-flow-col auto-cols-[minmax(14rem,1fr)] gap-3 overflow-x-auto pb-2">
              {MONITOR_COLUMNS.map((s) => {
                const cards = groupByStage(board.data.cards)[s];
                return (
                  <section key={s} aria-label={STATUS_LABELS[s]} className="rounded-card bg-background p-2">
                    <h2 className="mb-2 flex items-center justify-between px-1 text-subtitle">
                      {STATUS_LABELS[s]} <span className="text-text-secondary tabular-nums">{cards.length}</span>
                    </h2>
                    <ul className="flex flex-col gap-2">
                      {cards.map((c) => (
                        <li key={c.id}>
                          <MonitorCardView card={c} now={now} onOpen={() => setOpen(c.id)} />
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}
      {board.data && tab === "time" ? (
        waiting.length === 0 ? (
          <Card>
            <EmptyState icon={Clock} title="Hammasiga vaqt berilgan" description="Navbatdagi yangi buyurtmalar shu yerda paydo boʻladi." />
          </Card>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-label="Vaqt berilmagan buyurtmalar">
            {waiting.map((c) => (
              <li key={c.id}>
                <MonitorCardView card={c} now={now} onOpen={() => setOpen(c.id)} />
              </li>
            ))}
          </ul>
        )
      ) : null}
      {board.data && tab === "issues" ? <IssuesList onOpenOrder={setOpen} /> : null}
      {board.data && tab === "receipts" ? <ReceiptQueue query={drafts} onOpen={setReceipt} /> : null}
      {board.data && tab === "returns" ? <ReturnsList /> : null}
      {open !== null ? <OrderDrawer id={open} onClose={() => setOpen(null)} onCreated={() => undefined} /> : null}
      {receipt !== null ? <ReceiptDrawer id={receipt} onClose={() => setReceipt(null)} onCreated={() => undefined} /> : null}
    </>
  );
}

function Stat({ label, value, icon: Icon, tone }: { label: string; value: number; icon: typeof Clock; tone?: "warning" | "danger" }) {
  return (
    <div className="rounded-card border border-border bg-surface p-3">
      <div className="flex items-center gap-2 text-caption text-text-secondary">
        <Icon size={16} strokeWidth={1.5} aria-hidden /> {label}
      </div>
      <div className={`mt-1 text-page-title tabular-nums ${tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : ""}`}>
        {formatQuantity(value)}
      </div>
    </div>
  );
}

function MonitorCardView({ card: c, now, onOpen }: { card: MonitorCard; now: Date; onOpen: () => void }) {
  const t = c.deadline ? timerText(new Date(c.deadline), now) : null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`w-full rounded-card border bg-surface p-2 text-left hover:border-primary ${c.late || c.stale ? "border-danger" : "border-border"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-caption">{c.number}</span>
        {c.marked ? (
          <Badge tone="info" icon={Tag}>
            Markirovka
          </Badge>
        ) : null}
      </div>
      <div className="mt-1 truncate">{c.customer}</div>
      <div className="mt-1 text-caption text-text-secondary">
        {formatQuantity(c.lines)} xil · {formatQuantity(c.totalQty)} dona
        {c.person ? ` · ${c.person}` : ""}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-caption">
        {t ? (
          <span className={`inline-flex items-center gap-1 tabular-nums ${t.late ? "text-danger" : ""}`} role="timer">
            <Timer size={14} strokeWidth={1.5} aria-hidden />
            {t.text}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-text-secondary">
            <Clock size={14} strokeWidth={1.5} aria-hidden />
            {sinceText(new Date(c.since), now)}
          </span>
        )}
        {c.status === "QUEUED" && !c.timeGiven ? (
          <Badge tone="warning" icon={Clock}>
            Vaqt berilmagan
          </Badge>
        ) : null}
        {c.stale ? (
          <Badge tone="danger" icon={CalendarX}>
            Kechikkan
          </Badge>
        ) : null}
      </div>
    </button>
  );
}

/** Kirim qabuli: qabul kutayotgan (Qoralama) kirimlar — qator bosilsa kirim oynasi ochiladi. */
function ReceiptQueue({ query, onOpen }: { query: ReturnType<typeof useReceipts>; onOpen: (id: number) => void }) {
  const columns: TableColumn<ReceiptSummary>[] = [
    { key: "number", title: "Raqam", mono: true },
    { key: "receiptDate", title: "Sana", render: (d) => formatIsoDate(d.receiptDate) },
    { key: "supplier", title: "Yetkazib beruvchi" },
    { key: "invoiceNumber", title: "Yuk xati", mono: true, render: (d) => d.invoiceNumber ?? "—" },
    { key: "warehouse", title: "Ombor" },
    { key: "totalQty", title: "Miqdor", align: "right", render: (d) => <span className="tabular-nums">{formatQuantity(d.totalQty)}</span> },
  ];
  return (
    <Table
      columns={columns}
      rows={query.data?.items ?? []}
      rowKey={(d) => String(d.id)}
      caption="Qabul kutayotgan kirimlar"
      loading={query.isPending}
      onRowClick={(d) => onOpen(d.id)}
      emptyState={
        query.error ? (
          <ErrorState onRetry={() => void query.refetch()} />
        ) : (
          <EmptyState
            icon={PackageOpen}
            title="Qabul kutayotgan kirim yoʻq"
            description="Yangi kirim kiritilganda shu yerda paydo boʻladi."
          />
        )
      }
    />
  );
}
