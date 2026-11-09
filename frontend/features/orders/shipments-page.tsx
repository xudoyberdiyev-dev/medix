"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Ban,
  CalendarDays,
  CalendarX,
  Clock,
  HandHelping,
  Info,
  ListPlus,
  MapPin,
  PackageCheck,
  Printer,
  Receipt,
  Route,
  ShieldAlert,
  Snowflake,
  TriangleAlert,
  Truck,
  User,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { RowMenu, type RowMenuItem } from "@/components/ui/row-menu";
import { EmptyState, ErrorState, ForbiddenState, Skeleton } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { can } from "@/features/auth/can";
import { ensureCsrf, useMe } from "@/features/auth/session";
import { formatIsoDate } from "@/features/counterparties/api";
import { describeError } from "@/features/setup/form-error";
import { api, unwrap } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { formatDateTime, formatMoney, formatQuantity } from "@/lib/format";
import { useBranchStore } from "@/lib/stores/branch";
import { useLiveConnected } from "@/lib/live";
import {
  agoText,
  deliveryDateState,
  groupByRegion,
  minutesSince,
  TRIP_STATUS,
  tripProgress,
  type HandedSale,
  type ReadyOrder,
  type TripSummary,
} from "./shipments-model";
import type { OrdersT } from "./i18n";
import { TripEditModal } from "./trip-edit-modal";

export { placesText, TRIP_STATUS, type ReadyOrder, type TripStatus, type TripSummary } from "./shipments-model";

type ShipTab = "ready" | "trips" | "done";

function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(new Date());
}

/** Olib ketishni kutayotgan (nakladnoy berilgan, «Yuklanmoqda») buyurtma — kartada koʻrsatish uchun. */
interface PickupCard {
  id: number;
  number: string;
  customer: string;
  total: string;
  ready?: ReadyOrder;
  waybill?: boolean;
}

/**
 * Joʻnatish (prototip Shipping): yorliqlar Tayyor / Reyslar / Topshirilgan. «Tayyor» — «Mijoz oʻzi olib ketadi»
 * kartalari (topshirish) va «Yetkazish» hudud boʻyicha jadval; reys bu yerda tuzilmaydi — Ombor mudiri paneli
 * «Hujjatlashtirish» (E5, prototip T9-4a2).
 */
export function ShipmentsPage() {
  const tr = useTranslations("orders");
  const live = useLiveConnected();
  const me = useMe();
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const rawTab = useSearchParams().get("tab");
  const tab: ShipTab = rawTab === "trips" || rawTab === "done" ? rawTab : "ready";
  const setTab = (k: string) => router.replace(k === "ready" ? pathname : `${pathname}?tab=${k}`, { scroll: false });
  const allowed = can(me.data, "shipments.view");
  const canTrip = can(me.data, "shipments.trip");
  const canShip = can(me.data, "shipments.ship");
  const selectedBranch = useBranchStore((s) => s.branchId);
  const scopeBranch = me.data?.allBranches ? (selectedBranch ?? null) : null;
  const ready = useQuery({
    queryKey: ["trips", "ready", scopeBranch],
    queryFn: () => unwrap(api.GET("/api/trips/ready", { params: { query: { branchId: scopeBranch ?? undefined } } })),
    enabled: allowed,
    refetchInterval: live ? 60_000 : 20_000,
  });
  const trips = useQuery({
    queryKey: ["trips", "list", "all", scopeBranch],
    queryFn: () => unwrap(api.GET("/api/trips", { params: { query: { branchId: scopeBranch ?? undefined, active: false } } })),
    enabled: allowed,
  });
  const handed = useQuery({
    queryKey: ["trips", "handed", scopeBranch],
    queryFn: () => unwrap(api.GET("/api/trips/handed", { params: { query: { branchId: scopeBranch ?? undefined } } })),
    enabled: allowed,
  });
  const waiting = useQuery({
    queryKey: ["orders", "list", "pickup-loading", scopeBranch],
    queryFn: () =>
      unwrap(api.GET("/api/orders", { params: { query: { status: "LOADING", branchId: scopeBranch ?? undefined, size: 200 } } })),
    enabled: allowed,
    select: (p) => p.items.filter((o) => o.deliveryType === "PICKUP"),
  });
  const [error, setError] = useState<unknown>(null);
  const [cancelling, setCancelling] = useState<TripSummary | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [cancelError, setCancelError] = useState<unknown>(null);
  const [cancelPending, setCancelPending] = useState(false);
  const [pending, setPending] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const deliveries = useMemo(() => (ready.data ?? []).filter((o) => o.delivery === "DELIVERY"), [ready.data]);
  const pickups: PickupCard[] = useMemo(
    () => [
      ...(waiting.data ?? []).map((o) => ({ id: o.id, number: o.number, customer: o.customer, total: o.total, waybill: true })),
      ...(ready.data ?? [])
        .filter((o) => o.delivery === "PICKUP")
        .map((o) => ({ id: o.id, number: o.number, customer: o.customer, total: o.total, ready: o })),
    ],
    [ready.data, waiting.data],
  );

  if (me.data && !allowed) return <ForbiddenState description={tr("shipments.forbidden")} />;

  const readyCount = deliveries.length + pickups.length;
  const activeTrips = (trips.data ?? []).filter((t) => ["PLANNED", "IN_TRANSIT", "RETURN_WAIT"].includes(t.status)).length;
  const today = todayIso();

  async function handover(id: number) {
    setPending(id);
    setError(null);
    try {
      await ensureCsrf();
      const r = await unwrap(api.POST("/api/trips/pickup/{orderId}/handover", { params: { path: { orderId: id } } }));
      toast({ tone: "success", title: tr("shipments.pickedUp"), description: tr("shipments.pickedUpHint", { sale: r.sale }) });
      await qc.invalidateQueries({ queryKey: ["orders"] });
      await qc.invalidateQueries({ queryKey: ["trips"] });
    } catch (e) {
      setError(e);
    } finally {
      setPending(null);
    }
  }

  async function cancelTrip() {
    if (!cancelling) return;
    setCancelPending(true);
    setCancelError(null);
    try {
      await ensureCsrf();
      await unwrap(api.POST("/api/trips/{id}/cancel", { params: { path: { id: cancelling.id } }, body: { reason: reason.trim() } }));
      setCancelling(null);
      setReason("");
      await qc.invalidateQueries({ queryKey: ["trips"] });
      await qc.invalidateQueries({ queryKey: ["orders"] });
    } catch (e) {
      setCancelError(e);
    } finally {
      setCancelPending(false);
    }
  }

  const openOrder = (id: number) => router.push(`/orders/${id}`);
  const printSheet = (id: number) => window.open(`/api/trips/${id}/sheet/pdf`, "_blank", "noopener");

  const dColumns: TableColumn<ReadyOrder>[] = [
    { key: "number", title: tr("shipments.cNo"), mono: true, width: 124 },
    {
      key: "customer",
      title: tr("shipments.cCust"),
      render: (o) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{o.customer}</span>
          {o.phone ? <span className="text-caption text-text-secondary">{o.phone}</span> : null}
        </span>
      ),
    },
    {
      key: "address",
      title: tr("shipments.cAddr"),
      wrap: true,
      render: (o) => <span className="text-text-secondary">{o.address ?? tr("shipments.noAddress")}</span>,
    },
    {
      key: "deliveryDate",
      title: tr("shipments.cDelDate"),
      width: 128,
      render: (o) => {
        const st = deliveryDateState(o.deliveryDate, today);
        if (st === "today")
          return (
            <Badge tone="info" icon={CalendarDays}>
              {tr("shipments.today")}
            </Badge>
          );
        if (st === "late")
          return (
            <Badge tone="danger" icon={CalendarX}>
              {formatIsoDate(o.deliveryDate ?? "")}
            </Badge>
          );
        return st === "later" ? formatIsoDate(o.deliveryDate ?? "") : "—";
      },
    },
    { key: "lines", title: tr("shipments.cLines"), align: "right", width: 72, render: (o) => formatQuantity(o.lines) },
    { key: "total", title: tr("shipments.cSum"), align: "right", width: 132, render: (o) => formatMoney(o.total) },
    { key: "flags", title: tr("shipments.cFlags"), width: 96, render: (o) => <Flags o={o} tr={tr} /> },
  ];

  const tColumns: TableColumn<TripSummary>[] = [
    { key: "number", title: tr("shipments.cNo"), mono: true, width: 128 },
    { key: "tripDate", title: tr("shipments.cDate"), width: 100, render: (t) => formatIsoDate(t.tripDate) },
    {
      key: "driver",
      title: tr("shipments.cDriver"),
      render: (t) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{t.driver}</span>
          {t.driverPhone ? <span className="text-caption text-text-secondary">{t.driverPhone}</span> : null}
        </span>
      ),
    },
    {
      key: "vehicle",
      title: tr("shipments.cCar"),
      render: (t) => (
        <span className="flex min-w-0 flex-col">
          <span className="flex items-center gap-1.5">
            {t.plateNumber}
            {t.refrigerator ? (
              <Snowflake size={14} strokeWidth={1.5} className="text-info" aria-label={tr("shipments.fridge")}>
                <title>{tr("shipments.fridge")}</title>
              </Snowflake>
            ) : null}
          </span>
          {t.vehicleModel ? <span className="text-caption text-text-secondary">{t.vehicleModel}</span> : null}
        </span>
      ),
    },
    { key: "orders", title: tr("shipments.cStops"), align: "right", width: 80, render: (t) => formatQuantity(t.orders) },
    { key: "total", title: tr("shipments.cSum"), align: "right", width: 132, render: (t) => formatMoney(t.total) },
    {
      key: "status",
      title: tr("shipments.cStatus"),
      width: 170,
      render: (t) => {
        const st = TRIP_STATUS[t.status];
        return (
          <Badge tone={st.tone} icon={st.icon}>
            {tr(`shipments.tripStatus.${t.status}`)}
          </Badge>
        );
      },
    },
    {
      key: "progress",
      title: tr("shipments.cProg"),
      width: 150,
      render: (t) => <span className={cn(t.status === "DONE" ? "text-success" : "text-text-secondary")}>{tripProgress(t, tr)}</span>,
    },
  ];

  const sColumns: TableColumn<HandedSale>[] = [
    { key: "number", title: tr("shipments.cSaleNo"), mono: true, width: 136 },
    {
      key: "orderNumber",
      title: tr("shipments.cOrder"),
      width: 128,
      render: (s) => <span className="font-mono text-text-secondary">{s.orderNumber}</span>,
    },
    {
      key: "customer",
      title: tr("shipments.cCust"),
      render: (s) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{s.customer}</span>
          {s.region ? <span className="text-caption text-text-secondary">{s.region}</span> : null}
        </span>
      ),
    },
    {
      key: "method",
      title: tr("shipments.cMethod"),
      width: 170,
      render: (s) => (
        <span className="flex items-center gap-1.5">
          {s.method === "PICKUP" ? (
            <User size={14} strokeWidth={1.5} aria-hidden className="text-text-secondary" />
          ) : (
            <Truck size={14} strokeWidth={1.5} aria-hidden className="text-text-secondary" />
          )}
          {s.method === "PICKUP" ? tr("shipments.mPickup") : tr("shipments.mTrip", { t: s.tripNumber ?? "—" })}
        </span>
      ),
    },
    { key: "at", title: tr("shipments.cTime"), width: 140, render: (s) => formatDateTime(new Date(s.at)) },
    { key: "total", title: tr("shipments.cSum"), align: "right", width: 132, render: (s) => formatMoney(s.total) },
    { key: "by", title: tr("shipments.cBy"), width: 150, render: (s) => <span className="text-text-secondary">{s.by}</span> },
  ];

  const err = describeError(error);
  const cancelErr = describeError(cancelError);
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-baseline gap-2 text-page-title">
          {tr("shipments.title")}
          {ready.data ? <span className="tabular text-body text-text-secondary">{formatQuantity(readyCount)}</span> : null}
        </h1>
        {canTrip ? (
          <Link
            href="/warehouse?tab=docs"
            className="inline-flex h-control-md items-center gap-2 rounded-control border border-border bg-surface px-3 hover:border-primary"
          >
            <Route size={16} strokeWidth={1.5} aria-hidden /> {tr("shipments.goDocs")}
          </Link>
        ) : null}
      </div>
      <div className="mb-4">
        <Tabs
          aria-label={tr("shipments.title")}
          value={tab}
          onChange={setTab}
          items={[
            { key: "ready", label: tr("shipments.vReady"), count: ready.data ? readyCount : undefined },
            { key: "trips", label: tr("shipments.vTrips"), count: trips.data ? activeTrips : undefined },
            { key: "done", label: tr("shipments.vDone"), count: handed.data?.length },
          ]}
        />
      </div>
      {err.message ? <Alert tone="danger" title={err.message} className="mb-4" /> : null}

      {tab === "ready" ? (
        ready.error ? (
          <ErrorState onRetry={() => ready.refetch()} />
        ) : ready.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <section aria-label={tr("shipments.readyAria")} className="flex flex-col gap-4">
            <p className="flex items-start gap-1.5 text-caption text-text-secondary">
              <Info size={14} strokeWidth={1.5} aria-hidden className="mt-0.5 flex-none" />
              {tr("shipments.tripInDocs")}
            </p>
            {readyCount === 0 ? (
              <div className="rounded-card border border-border bg-surface">
                <EmptyState icon={PackageCheck} title={tr("shipments.readyEmptyTitle")} description={tr("shipments.readyEmptyHint")} />
              </div>
            ) : null}
            {pickups.length > 0 ? (
              <section aria-label={tr("shipments.gPickup")} className="flex flex-col gap-3">
                <GroupTitle icon={User} title={tr("shipments.gPickup")} count={pickups.length} />
                <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {pickups.map((c) => {
                    const r = c.ready;
                    const wait = r ? minutesSince(r.readyAt, now) : null;
                    return (
                      <li key={c.id} className="flex min-w-0 flex-col gap-2.5 rounded-card border border-border bg-surface p-4">
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span className="truncate text-body font-semibold">{c.customer}</span>
                          <button
                            type="button"
                            onClick={() => openOrder(c.id)}
                            className="self-start font-mono text-caption text-primary hover:underline"
                          >
                            {c.number}
                          </button>
                        </div>
                        <div className="text-caption text-text-primary">
                          {r
                            ? tr("shipments.meta", { l: formatQuantity(r.lines), q: formatQuantity(r.qty), s: formatMoney(r.total) })
                            : formatMoney(c.total)}
                        </div>
                        {r && (r.controlled || r.shortQty > 0) ? <FlagBadges o={r} tr={tr} /> : null}
                        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border pt-1.5">
                          <span
                            className={cn(
                              "flex items-center gap-1 text-caption",
                              wait !== null && wait > 120 ? "text-warning" : "text-text-secondary",
                            )}
                          >
                            <Clock size={12} strokeWidth={1.5} aria-hidden />
                            {wait !== null ? tr("shipments.picked", { t: agoText(wait, tr) }) : c.waybill ? tr("shipments.waiting") : ""}
                          </span>
                          {c.waybill && canShip ? (
                            <Button size="sm" icon={HandHelping} loading={pending === c.id} onClick={() => void handover(c.id)}>
                              {tr("shipments.hand")}
                            </Button>
                          ) : !c.waybill ? (
                            <span className="text-caption text-text-secondary">{tr("shipments.waitWaybill")}</span>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}
            {deliveries.length > 0 ? (
              <section aria-label={tr("shipments.gDeliver")} className="flex flex-col gap-3">
                <GroupTitle icon={Truck} title={tr("shipments.gDeliver")} count={deliveries.length} />
                {groupByRegion(deliveries).map((g) => (
                  <div key={g.region ?? "-"} className="rounded-card border border-border bg-surface">
                    <div className="flex min-h-10 items-center gap-2 border-b border-border px-3.5">
                      <MapPin size={14} strokeWidth={1.5} aria-hidden className="text-text-secondary" />
                      <span className="text-caption font-semibold">{g.region ?? tr("shipments.noRegion")}</span>
                      <CountPill n={g.orders.length} />
                      <span className="ml-auto text-caption text-text-secondary tabular-nums">{formatMoney(g.total)}</span>
                    </div>
                    <Table
                      caption={tr("shipments.deliverCaption", { area: g.region ?? tr("shipments.noRegion") })}
                      columns={dColumns}
                      rows={g.orders}
                      rowKey={(o) => String(o.id)}
                      onRowClick={(o) => openOrder(o.id)}
                      rowActions={(o) => (
                        <RowMenu
                          items={[
                            {
                              key: "open",
                              label: tr("shipments.openOrder"),
                              icon: <ArrowUpRight size={16} strokeWidth={1.5} />,
                              onSelect: () => openOrder(o.id),
                            },
                          ]}
                        />
                      )}
                    />
                  </div>
                ))}
              </section>
            ) : null}
          </section>
        )
      ) : null}

      {tab === "trips" ? (
        trips.error ? (
          <ErrorState onRetry={() => trips.refetch()} />
        ) : (
          <section aria-label={tr("shipments.tripsCaption")}>
            <Table
              caption={tr("shipments.tripsCaption")}
              columns={tColumns}
              rows={trips.data ?? []}
              rowKey={(t) => String(t.id)}
              loading={trips.isPending}
              onRowClick={(t) => printSheet(t.id)}
              rowActions={(t) => {
                const items: RowMenuItem[] = [
                  {
                    key: "sheet",
                    label: tr("shipments.printSheet"),
                    icon: <Printer size={16} strokeWidth={1.5} />,
                    onSelect: () => printSheet(t.id),
                  },
                ];
                if (canTrip && t.status === "PLANNED") {
                  items.push(
                    {
                      key: "edit",
                      label: tr("shipments.editTrip"),
                      icon: <ListPlus size={16} strokeWidth={1.5} />,
                      onSelect: () => setEditing(t.id),
                    },
                    {
                      key: "cancel",
                      label: tr("shipments.cancelTrip"),
                      icon: <Ban size={16} strokeWidth={1.5} />,
                      onSelect: () => setCancelling(t),
                    },
                  );
                }
                return <RowMenu items={items} />;
              }}
              emptyState={<EmptyState icon={Route} title={tr("shipments.tripsEmptyT")} description={tr("shipments.tripsEmptyD")} />}
            />
          </section>
        )
      ) : null}

      {tab === "done" ? (
        handed.error ? (
          <ErrorState onRetry={() => handed.refetch()} />
        ) : (
          <Table
            caption={tr("shipments.doneCaption")}
            columns={sColumns}
            rows={handed.data ?? []}
            rowKey={(s) => String(s.id)}
            loading={handed.isPending}
            onRowClick={(s) => openOrder(s.orderId)}
            emptyState={<EmptyState icon={Receipt} title={tr("shipments.doneEmptyT")} description={tr("shipments.doneEmptyD")} />}
          />
        )
      ) : null}

      <TripEditModal tripId={editing} ready={ready.data ?? []} onClose={() => setEditing(null)} />
      <Modal
        open={cancelling !== null}
        onClose={() => setCancelling(null)}
        title={tr("shipments.cancelTrip")}
        tone="danger"
        primaryAction={{
          label: tr("shipments.cancelTrip"),
          onClick: () => void cancelTrip(),
          loading: cancelPending,
          disabled: !reason.trim(),
        }}
      >
        <p className="mb-3">{tr("shipments.cancelText", { number: cancelling?.number ?? "" })}</p>
        <TextField label={tr("shipments.reason")} value={reason} onChange={setReason} maxLength={300} error={cancelErr.fields.reason} />
        {cancelErr.message ? <Alert tone="danger" title={cancelErr.message} className="mt-3" /> : null}
      </Modal>
    </>
  );
}

type Tr = OrdersT;

function CountPill({ n }: { n: number }) {
  return (
    <span className="inline-flex h-[18px] items-center rounded-[6px] bg-table-header px-1.5 text-[11.5px] font-medium text-text-secondary">
      {formatQuantity(n)}
    </span>
  );
}

function GroupTitle({ icon: Icon, title, count }: { icon: typeof Truck; title: string; count: number }) {
  return (
    <div className="flex items-center gap-2">
      <Icon size={16} strokeWidth={1.5} aria-hidden className="text-text-secondary" />
      <h2 className="text-body font-semibold">{title}</h2>
      <CountPill n={count} />
    </div>
  );
}

function FlagBadges({ o, tr }: { o: ReadyOrder; tr: Tr }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {o.controlled ? (
        <Badge tone="danger" icon={ShieldAlert}>
          {tr("shipments.bCtrl")}
        </Badge>
      ) : null}
      {o.shortQty > 0 ? (
        <Badge tone="warning" icon={TriangleAlert}>
          {tr("shipments.bShort", { n: formatQuantity(o.shortQty) })}
        </Badge>
      ) : null}
    </div>
  );
}

function Flags({ o, tr }: { o: ReadyOrder; tr: Tr }) {
  return (
    <span className="flex items-center gap-1.5">
      {o.controlled ? (
        <ShieldAlert size={16} strokeWidth={1.5} className="text-danger" aria-label={tr("shipments.bCtrl")}>
          <title>{tr("shipments.bCtrl")}</title>
        </ShieldAlert>
      ) : null}
      {o.shortQty > 0 ? (
        <TriangleAlert
          size={16}
          strokeWidth={1.5}
          className="text-warning"
          aria-label={tr("shipments.bShort", { n: formatQuantity(o.shortQty) })}
        >
          <title>{tr("shipments.bShort", { n: formatQuantity(o.shortQty) })}</title>
        </TriangleAlert>
      ) : null}
    </span>
  );
}
