"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleX,
  GripVertical,
  Printer,
  Route,
  Search,
  ShieldAlert,
  Smartphone,
  Snowflake,
  Truck,
  TriangleAlert,
  X,
  type LucideIcon,
  FileText,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DocumentHeader } from "@/components/ui/document-header";
import { Modal } from "@/components/ui/modal";
import { RowMenu } from "@/components/ui/row-menu";
import { Select } from "@/components/ui/select";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/system-states";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { can } from "@/features/auth/can";
import { ensureCsrf, useMe } from "@/features/auth/session";
import { formatIsoDate, parseUzDate } from "@/features/counterparties/api";
import { Steps } from "@/features/payments/payment-doc-page";
import { describeError } from "@/features/setup/form-error";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { cn } from "@/lib/cn";
import { formatDateTime, formatMoney, formatQuantity } from "@/lib/format";
import { TRIP_STATUS } from "./shipments-model";
import { availableOrders, moveItem, stopTotals, tripSteps } from "./trip-page-model";

type TripDetail = components["schemas"]["TripDetail"];
type TripStop = components["schemas"]["TripStop"];
type SaveState = "saving" | "saved" | "error" | null;

interface Head {
  date: string;
  driver: string | null;
  car: string | null;
  exp: string;
}

const headOf = (t: TripDetail): Head => ({
  date: formatIsoDate(t.tripDate),
  driver: String(t.driverId),
  car: String(t.vehicleId),
  exp: t.expeditor ?? "",
});

/**
 * Reys sahifasi (prototip `TripPage`): `/shipments/trips/[id]`. Rejalashtirilgan reysda (haydovchi hali yuklamagan) — sarlavha
 * avtomatik saqlanadi, chapda tayyor buyurtmalar (hudud boʻyicha), oʻngda reys tarkibi (sudrab tartiblash, chiqarish).
 * Yuklash, boshlash va natijalar — Haydovchi panelida; bu yerda koʻrish va nazorat. Reys Ombor mudiri panelida tuziladi (E5).
 */
export function TripPage({ id }: { id: number }) {
  const t = useTranslations("orders.tripPage");
  const tr = useTranslations("orders");
  const me = useMe();
  const qc = useQueryClient();
  const canTrip = can(me.data, "shipments.trip");
  const trip = useQuery({
    queryKey: ["trips", "detail", id],
    queryFn: () => unwrap(api.GET("/api/trips/{id}", { params: { path: { id } } })),
  });
  const data = trip.data;
  const anyLoaded = (data?.stops ?? []).some((s) => s.loadedAt != null);
  const editable = canTrip && data?.status === "PLANNED" && !anyLoaded;
  const branchId = data?.branchId ?? null;
  const ready = useQuery({
    queryKey: ["trips", "ready", branchId],
    queryFn: () => unwrap(api.GET("/api/trips/ready", { params: { query: { branchId: branchId ?? undefined } } })),
    enabled: editable && branchId != null,
  });
  const options = useQuery({
    queryKey: ["trips", "options", branchId],
    queryFn: () => unwrap(api.GET("/api/trips/options", { params: { query: { branchId: branchId ?? 0 } } })),
    enabled: editable && branchId != null,
  });

  const [head, setHead] = useState<Head | null>(null);
  const [tried, setTried] = useState(false);
  const [save, setSave] = useState<SaveState>(null);
  const [savedAt, setSavedAt] = useState<string>("");
  const [q, setQ] = useState("");
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const [order, setOrder] = useState<number[] | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [removing, setRemoving] = useState<TripStop | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [adding, setAdding] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Server holati yangilansa (boshqa oynadan ham) — sarlavha va tartib serverdan
  const h = head ?? (data ? headOf(data) : null);
  useEffect(() => () => (timer.current ? clearTimeout(timer.current) : undefined), []);

  const stopsById = useMemo(() => new Map((data?.stops ?? []).map((s) => [s.id, s])), [data]);
  const stops = useMemo(() => {
    const base = data?.stops ?? [];
    if (!order) return base;
    const list = order.map((x) => stopsById.get(x)).filter((x): x is TripStop => x != null);
    return list.length === base.length ? list : base;
  }, [data, order, stopsById]);
  const avail = useMemo(() => (data ? availableOrders(ready.data ?? [], data.branchId, q) : []), [ready.data, data, q]);
  const groups = useMemo(() => {
    const m = new Map<string, typeof avail>();
    for (const o of avail) {
      const k = o.region ?? "";
      m.set(k, [...(m.get(k) ?? []), o]);
    }
    return [...m.entries()].sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b, "uz")));
  }, [avail]);

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ["trips"] });
    await qc.invalidateQueries({ queryKey: ["orders"] });
  }

  function stamp() {
    setSave("saved");
    setSavedAt(new Intl.DateTimeFormat("uz-UZ", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tashkent" }).format(new Date()));
  }

  function editHead(patch: Partial<Head>) {
    if (!h || !data) return;
    const next = { ...h, ...patch };
    setHead(next);
    if (timer.current) clearTimeout(timer.current);
    const iso = parseUzDate(next.date);
    if (!iso || !next.driver || !next.car) {
      setTried(true);
      return;
    }
    setSave("saving");
    timer.current = setTimeout(() => void saveHead(next, iso), 600);
  }

  async function saveHead(next: Head, iso: string) {
    try {
      await ensureCsrf();
      const r = await unwrap(
        api.PUT("/api/trips/{id}", {
          params: { path: { id } },
          body: {
            vehicleId: Number(next.car),
            driverId: Number(next.driver),
            tripDate: iso,
            expeditor: next.exp.trim() || undefined,
            note: data?.note ?? undefined,
          },
        }),
      );
      qc.setQueryData(["trips", "detail", id], r);
      setError(null);
      stamp();
      void qc.invalidateQueries({ queryKey: ["trips"], exact: false, refetchType: "none" });
    } catch (e) {
      setSave("error");
      setError(e);
    }
  }

  async function addOrder(orderId: number) {
    setAdding(orderId);
    setError(null);
    setSave("saving");
    try {
      await ensureCsrf();
      const r = await unwrap(api.POST("/api/trips/{id}/orders", { params: { path: { id } }, body: { orderIds: [orderId] } }));
      qc.setQueryData(["trips", "detail", id], r);
      setOrder(null);
      stamp();
      await refresh();
    } catch (e) {
      setSave("error");
      setError(e);
    } finally {
      setAdding(null);
    }
  }

  async function reorder(next: TripStop[]) {
    setOrder(next.map((s) => s.id));
    setSave("saving");
    setError(null);
    try {
      await ensureCsrf();
      const r = await unwrap(
        api.POST("/api/trips/{id}/stops/order", { params: { path: { id } }, body: { stopIds: next.map((s) => s.id) } }),
      );
      qc.setQueryData(["trips", "detail", id], r);
      setOrder(null);
      stamp();
    } catch (e) {
      setOrder(null);
      setSave("error");
      setError(e);
    }
  }

  async function remove() {
    if (!removing || !reason.trim()) return;
    setPending(true);
    setError(null);
    try {
      await ensureCsrf();
      const r = await unwrap(
        api.POST("/api/trips/{id}/orders/{orderId}/remove", {
          params: { path: { id, orderId: removing.orderId } },
          body: { reason: reason.trim() },
        }),
      );
      qc.setQueryData(["trips", "detail", id], r);
      setOrder(null);
      setRemoving(null);
      setReason("");
      stamp();
      await refresh();
    } catch (e) {
      setRemoving(null);
      setError(e);
    } finally {
      setPending(false);
    }
  }

  async function cancelTrip() {
    if (!reason.trim()) return;
    setPending(true);
    setError(null);
    try {
      await ensureCsrf();
      const r = await unwrap(api.POST("/api/trips/{id}/cancel", { params: { path: { id } }, body: { reason: reason.trim() } }));
      qc.setQueryData(["trips", "detail", id], r);
      setCancelling(false);
      setReason("");
      toast({ tone: "success", title: t("tCancelled") });
      await refresh();
    } catch (e) {
      setCancelling(false);
      setError(e);
    } finally {
      setPending(false);
    }
  }

  if (trip.error) return <ErrorState error={trip.error} onRetry={() => trip.refetch()} />;
  if (!data || !h || !me.data) return <Skeleton className="h-96" />;

  const st = data.status;
  const look = TRIP_STATUS[st];
  const tot = stopTotals(stops);
  const dateIso = parseUzDate(h.date);
  const dateErr = tried && !dateIso;
  const car = options.data?.vehicles.find((v) => String(v.id) === h.car);
  const plate = car?.plateNumber ?? data.plateNumber;
  const model = car?.model ?? data.vehicleModel;
  const fridge = car ? car.hasRefrigerator : data.refrigerator;
  const marked = stops.filter((s) => s.outcome != null).length;
  const err = describeError(error);

  const banners: { tone: "info" | "success" | "warning"; icon: LucideIcon; text: string }[] = [];
  if (st === "DONE")
    banners.push({ tone: "success", icon: CircleCheck, text: `${t("doneBanner")} · ${t("tripDone", { a: marked, b: stops.length })}` });
  if (st === "CANCELLED")
    banners.push({ tone: "warning", icon: CircleX, text: `${t("cancBanner")}${data.cancelReason ? ` · ${data.cancelReason}` : ""}` });
  if (st === "PLANNED" || st === "IN_TRANSIT" || st === "RETURN_WAIT") banners.push({ tone: "info", icon: Smartphone, text: t("drvOwns") });
  if (st === "IN_TRANSIT" && data.startedAt)
    banners.push({ tone: "info", icon: Truck, text: t("transit", { at: formatDateTime(new Date(data.startedAt)), who: data.driver }) });

  const driverOpts = editable
    ? (options.data?.drivers ?? []).map((d) => ({ value: String(d.id), label: d.phone ? `${d.fullName} · ${d.phone}` : d.fullName }))
    : [{ value: String(data.driverId), label: data.driverPhone ? `${data.driver} · ${data.driverPhone}` : data.driver }];
  const carOpts = editable
    ? (options.data?.vehicles ?? []).map((v) => ({
        value: String(v.id),
        label: `${v.plateNumber} · ${v.model}${v.hasRefrigerator ? ` · ${t("fridge")}` : ""}`,
      }))
    : [{ value: String(data.vehicleId), label: data.vehicle }];

  const autosave =
    save === "saving" ? (
      <span className="text-caption text-text-secondary">{t("saving")}</span>
    ) : save === "error" ? (
      <span className="inline-flex items-center gap-1 text-caption text-danger">
        <CircleAlert size={12} strokeWidth={1.5} aria-hidden />
        {t("saveErr")}
      </span>
    ) : save === "saved" ? (
      <span className="text-caption text-text-secondary">{t("saved", { t: savedAt })}</span>
    ) : null;

  const sheetHref = `/api/trips/${id}/sheet/pdf`;
  /** O11: reysdagi hujjatlashtirilgan buyurtmalar HF — bitta PDF. */
  const invoiceOrderIds = st === "PLANNED" || st === "CANCELLED" ? [] : stops.filter((s) => s.waybillNumber).map((s) => s.orderId);
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <DocumentHeader
        parent={{ label: t("parent"), href: "/shipments?tab=trips" }}
        crumb={data.number}
        crumbMono
        title={t("title")}
        number={data.number}
        status={
          <Badge tone={look.tone} icon={look.icon}>
            {tr(`shipments.tripStatus.${st}`)}
          </Badge>
        }
        sub={
          <>
            <span>{formatIsoDate(data.tripDate)}</span>
            <span aria-hidden>·</span>
            <span>{data.driver}</span>
            <span aria-hidden>·</span>
            <span className="font-mono">{data.plateNumber}</span>
          </>
        }
        meta={
          <>
            <Steps steps={tripSteps(st).map((s) => ({ label: tr(`shipments.tripStatus.${s.key}`), state: s.state }))} />
            {autosave}
          </>
        }
        actions={
          <>
            <Button variant="secondary" icon={Printer} onClick={() => window.open(sheetHref, "_blank", "noopener")}>
              {t("print")}
            </Button>
            <Button
              variant="secondary"
              icon={FileText}
              onClick={() => window.open(`/api/orders/ttn/pdf?tripId=${id}`, "_blank", "noopener")}
            >
              {t("ttn")}
            </Button>
            {invoiceOrderIds.length > 0 ? (
              <Button
                variant="secondary"
                icon={FileText}
                data-testid="trip-invoices-pdf"
                onClick={() => window.open(`/api/orders/invoices/pdf?ids=${invoiceOrderIds.join(",")}`, "_blank", "noopener")}
              >
                {t("invoicesPdf")}
              </Button>
            ) : null}
            {canTrip && st === "PLANNED" ? (
              <RowMenu
                label={t("more")}
                items={[
                  { key: "cancel", label: t("cancelTrip"), icon: <Ban size={16} strokeWidth={1.5} />, onSelect: () => setCancelling(true) },
                ]}
              />
            ) : null}
          </>
        }
      />
      {err.message ? <Alert tone="danger" title={err.message} /> : null}
      {banners.map((b, i) => (
        <Alert key={i} tone={b.tone} icon={b.icon} title={b.text} />
      ))}

      <section
        className={cn(
          "grid grid-cols-2 gap-4 rounded-card border border-border px-4 py-4 lg:grid-cols-4",
          editable ? "bg-surface" : "bg-table-header",
        )}
      >
        <TextField
          variant="date"
          label={t("fDate")}
          value={h.date}
          onChange={(v) => editHead({ date: v })}
          placeholder="kk.oo.yyyy"
          inputMode="numeric"
          maxLength={10}
          required
          disabled={!editable}
          error={dateErr ? t("req") : undefined}
        />
        <Select
          label={t("fDriver")}
          value={h.driver}
          onChange={(v) => editHead({ driver: v })}
          options={driverOpts}
          required
          disabled={!editable}
          placeholder={t("pick")}
          error={tried && !h.driver ? t("req") : undefined}
        />
        <div className="flex min-w-0 flex-col gap-1">
          <Select
            label={t("fCar")}
            value={h.car}
            onChange={(v) => editHead({ car: v })}
            options={carOpts}
            required
            disabled={!editable}
            placeholder={t("pick")}
            error={tried && !h.car ? t("req") : undefined}
          />
          <span className="flex flex-wrap items-center gap-1.5 text-caption text-text-secondary">
            <span className="font-mono text-text-primary">{plate}</span>
            {model}
            {fridge ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-info-bg px-1.5 text-info">
                <Snowflake size={11} strokeWidth={1.5} aria-hidden />
                {t("fridge")}
              </span>
            ) : null}
          </span>
        </div>
        <TextField
          label={t("fExp")}
          value={h.exp}
          onChange={(v) => editHead({ exp: v })}
          placeholder={t("fExpPh")}
          maxLength={120}
          disabled={!editable}
        />
      </section>

      <div className={cn("grid min-w-0 items-start gap-4", editable && "lg:grid-cols-[420px_minmax(0,1fr)]")}>
        {editable ? (
          <section className="flex min-w-0 flex-col rounded-card border border-border bg-surface lg:sticky lg:top-0">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3.5">
              <span className="text-[14px] font-semibold">{t("readyList")}</span>
              <span className="rounded-full bg-table-header px-2 text-caption tabular-nums text-text-secondary">{avail.length}</span>
            </div>
            <div className="border-b border-border p-3">
              <label className="flex h-9 items-center gap-2 rounded-control border border-border bg-surface px-3 text-text-secondary focus-within:border-primary">
                <Search size={16} strokeWidth={1.5} aria-hidden />
                <input
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t("search")}
                  aria-label={t("search")}
                  className="min-w-0 flex-1 bg-transparent text-body text-text-primary outline-none"
                />
              </label>
            </div>
            <div className="max-h-[calc(100vh-360px)] overflow-y-auto">
              {ready.isPending ? <Skeleton className="m-3 h-24" /> : null}
              {groups.map(([region, list]) => {
                const open = !closed[region];
                return (
                  <div key={region} className="border-b border-border last:border-b-0">
                    <button
                      type="button"
                      onClick={() => setClosed((c) => ({ ...c, [region]: open }))}
                      className="flex w-full items-center gap-1.5 bg-table-header px-4 py-2.5 text-left text-caption font-semibold text-text-secondary"
                      aria-expanded={open}
                    >
                      {open ? (
                        <ChevronDown size={14} strokeWidth={1.5} aria-hidden />
                      ) : (
                        <ChevronRight size={14} strokeWidth={1.5} aria-hidden />
                      )}
                      {region || t("noRegion")}
                      <span className="ml-auto tabular-nums">{list.length}</span>
                    </button>
                    {open
                      ? list.map((o) => (
                          <button
                            key={o.id}
                            type="button"
                            role="checkbox"
                            aria-checked={false}
                            disabled={adding != null}
                            onClick={() => void addOrder(o.id)}
                            className="grid w-full grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-3 border-t border-border px-4 py-2.5 text-left hover:bg-primary-soft disabled:opacity-60"
                          >
                            <span
                              className="flex size-[18px] items-center justify-center rounded-[4px] border border-border bg-surface"
                              aria-hidden
                            >
                              {adding === o.id ? <Check size={12} strokeWidth={2} /> : null}
                            </span>
                            <span className="flex min-w-0 flex-col">
                              <span className="flex items-center gap-1.5">
                                <span className="truncate font-medium">{o.customer}</span>
                                {o.controlled ? (
                                  <ShieldAlert size={13} strokeWidth={1.5} className="shrink-0 text-danger" aria-label={t("bCtrl")} />
                                ) : null}
                                {o.shortQty > 0 ? (
                                  <TriangleAlert
                                    size={13}
                                    strokeWidth={1.5}
                                    className="shrink-0 text-warning"
                                    aria-label={t("bShort", { n: formatQuantity(o.shortQty) })}
                                  />
                                ) : null}
                              </span>
                              <span className="truncate text-caption text-text-secondary">{o.address ?? ""}</span>
                            </span>
                            <span className="flex flex-col items-end">
                              <span className="font-medium tabular-nums">{formatMoney(o.total)}</span>
                              <span className="font-mono text-caption text-text-secondary">{o.number}</span>
                            </span>
                          </button>
                        ))
                      : null}
                  </div>
                );
              })}
              {!ready.isPending && avail.length === 0 ? (
                <div className="px-4 py-8 text-center text-caption text-text-secondary">{t("noAvail")}</div>
              ) : null}
            </div>
          </section>
        ) : null}

        <section className="flex min-w-0 flex-col rounded-card border border-border bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3.5">
            <span className="text-[14px] font-semibold">{t("composition")}</span>
            {editable && stops.length > 1 ? (
              <span className="inline-flex items-center gap-1 text-caption text-text-secondary">
                <GripVertical size={14} strokeWidth={1.5} aria-hidden />
                {t("dragHint")}
              </span>
            ) : null}
          </div>
          {stops.length === 0 ? (
            <EmptyState icon={Route} title={t("noStops")} description={t("noStopsD")} />
          ) : (
            <ol className="flex flex-col gap-2 p-3">
              {stops.map((s, k) => {
                const canMove = editable && stops.length > 1;
                return (
                  <li
                    key={s.id}
                    draggable={canMove}
                    onDragStart={(e) => {
                      if (!canMove) return;
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", String(k));
                      setDrag(k);
                    }}
                    onDragOver={(e) => {
                      if (drag == null) return;
                      e.preventDefault();
                      if (over !== k) setOver(k);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const from = drag;
                      setDrag(null);
                      setOver(null);
                      if (from == null || from === k) return;
                      void reorder(moveItem(stops, from, k));
                    }}
                    onDragEnd={() => (setDrag(null), setOver(null))}
                    className={cn(
                      "grid grid-cols-[auto_36px_minmax(0,1fr)_auto_auto] items-center gap-3 rounded-card border bg-surface px-3 py-3",
                      over === k && drag !== k ? "border-primary" : "border-border",
                      drag === k && "opacity-40",
                    )}
                  >
                    <span className={cn(canMove ? "cursor-grab text-text-secondary" : "text-border")} title={t("dragHint")} aria-hidden>
                      <GripVertical size={18} strokeWidth={1.5} />
                    </span>
                    <span className="flex size-9 items-center justify-center rounded-full bg-primary-button text-[15px] font-semibold text-white tabular-nums">
                      {k + 1}
                    </span>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate font-semibold">{s.customer}</span>
                      <span className="truncate text-[13px] text-text-secondary">{[s.region, s.address].filter(Boolean).join(", ")}</span>
                      <span className="flex flex-wrap items-center gap-1.5 text-caption text-text-secondary">
                        {s.phone ? (
                          <>
                            <span>{s.phone}</span>
                            <span aria-hidden>·</span>
                          </>
                        ) : null}
                        <Link href={`/orders/${s.orderId}`} className="font-mono text-primary hover:underline" title={t("openOrder")}>
                          {s.orderNumber}
                        </Link>
                        {s.waybillNumber ? <span className="font-mono">· {s.waybillNumber}</span> : null}
                        {st !== "PLANNED" || s.loadedAt ? (
                          <span className={cn("inline-flex items-center gap-1", s.loadedAt ? "text-success" : "text-text-secondary")}>
                            · {s.loadedAt ? t("loaded") : t("notLoaded")}
                          </span>
                        ) : null}
                      </span>
                      {s.outcome ? <Outcome stop={s} /> : null}
                    </div>
                    <span className="text-right text-[13px] whitespace-nowrap text-text-secondary tabular-nums">
                      {t("stopMeta", { l: s.lines, s: formatMoney(s.total) })}
                    </span>
                    {editable ? (
                      <button
                        type="button"
                        aria-label={t("remove")}
                        title={t("remove")}
                        onClick={() => (setRemoving(s), setReason(""))}
                        className="flex size-8 items-center justify-center rounded-control text-text-secondary hover:bg-danger-bg hover:text-danger"
                      >
                        <X size={16} strokeWidth={1.5} />
                      </button>
                    ) : (
                      <span />
                    )}
                  </li>
                );
              })}
            </ol>
          )}
          <div className="flex min-h-[52px] flex-wrap items-center justify-end gap-x-7 gap-y-2 rounded-b-card border-t border-border bg-table-header px-5 py-2.5 tabular-nums">
            {[
              [t("tStops"), formatQuantity(tot.stops)],
              [t("tLines"), formatQuantity(tot.lines)],
              [t("tQty"), formatQuantity(tot.qty)],
            ].map(([k, v]) => (
              <span key={k} className="flex items-baseline gap-1.5 text-[13px] leading-[18px] whitespace-nowrap">
                <span className="text-text-secondary">{k}</span>
                <span className="font-medium">{v}</span>
              </span>
            ))}
            <span className="flex items-baseline gap-2 border-l border-border pl-5 whitespace-nowrap">
              <span className="text-[13px] text-text-secondary">{t("tSum")}</span>
              <span className="text-[16px] leading-[22px] font-semibold">{formatMoney(tot.sum)}</span>
            </span>
          </div>
        </section>
      </div>

      <Modal
        open={removing != null}
        onClose={() => setRemoving(null)}
        title={t("removeT", { n: removing?.orderNumber ?? "" })}
        primaryAction={{
          label: t("remove"),
          onClick: () => void remove(),
          loading: pending,
          disabled: !reason.trim() || stops.length <= 1,
        }}
        secondaryAction={{ label: t("back"), onClick: () => setRemoving(null) }}
      >
        <p className="mb-3 text-text-secondary">{stops.length <= 1 ? t("lastOne") : t("removeD")}</p>
        <TextField label={t("reason")} value={reason} onChange={setReason} maxLength={500} required />
      </Modal>
      <Modal
        open={cancelling}
        onClose={() => setCancelling(false)}
        tone="danger"
        title={t("cancelCT")}
        primaryAction={{ label: t("cancelTrip"), onClick: () => void cancelTrip(), loading: pending, disabled: !reason.trim() }}
        secondaryAction={{ label: t("back"), onClick: () => setCancelling(false) }}
      >
        <p className="mb-3 text-text-secondary">{t("cancelCD")}</p>
        <TextField label={t("reason")} value={reason} onChange={setReason} maxLength={500} required />
      </Modal>
    </div>
  );
}

function Outcome({ stop }: { stop: TripStop }) {
  const t = useTranslations("orders.tripPage");
  const look =
    stop.outcome === "DELIVERED"
      ? { cls: "bg-success-bg text-success", icon: CircleCheck, text: t("resOk") }
      : stop.outcome === "PARTIAL"
        ? {
            cls: "bg-warning-bg text-warning",
            icon: TriangleAlert,
            text: t("resPart", { n: stop.returnNumber ? `${stop.returnNumber} · ${formatMoney(stop.returnTotal ?? "0")}` : "—" }),
          }
        : { cls: "bg-danger-bg text-danger", icon: CircleX, text: t("resFail", { r: stop.outcomeReason ?? "—" }) };
  return (
    <span className={cn("mt-1 inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-caption font-medium", look.cls)}>
      <look.icon size={12} strokeWidth={1.5} aria-hidden />
      {look.text}
    </span>
  );
}
