"use client";

import {
  Boxes,
  Camera,
  Check,
  CircleCheck,
  CircleMinus,
  CircleDashed,
  CirclePlus,
  CircleX,
  Eye,
  EyeOff,
  Info,
  Layers,
  ListChecks,
  Lock,
  LockKeyhole,
  LockOpen,
  MessageSquare,
  Package,
  PackageOpen,
  Play,
  Plus,
  Printer,
  RotateCcw,
  ScanLine,
  ShieldAlert,
  Snowflake,
  Truck,
  Warehouse,
  X,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DocumentHeader } from "@/components/ui/document-header";
import { HistoryTimeline } from "@/components/ui/history-timeline";
import { Modal } from "@/components/ui/modal";
import { RowMenu } from "@/components/ui/row-menu";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/selection-controls";
import { ErrorState, ForbiddenState, Skeleton } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { can, canAny } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { useBranchList, useWarehouses } from "@/features/organization/api";
import { Steps } from "@/features/payments/payment-doc-page";
import { describeError } from "@/features/setup/form-error";
import { cn } from "@/lib/cn";
import { formatDate, formatDateTime, formatMoney, formatQuantity } from "@/lib/format";
import {
  IN_APPROVE,
  IN_COUNT,
  IN_CREATE,
  IN_DIRECTOR,
  IN_OPEN,
  IN_VIEW_KEYS,
  useApproveInventoryCount,
  useCancelInventoryCount,
  useCreateInventoryCount,
  useInventoryCount,
  useLineNote,
  useRecountInventoryCount,
  useScopeOptions,
  useStartInventoryCount,
  useUpdateInventoryCount,
  type InventoryCountDetail,
  type InventoryCountLine,
  type InventoryCountRequest,
} from "./api";
import {
  dayToIso,
  isoToDay,
  lineFilter,
  lineTabs,
  scopeCount,
  startErrors,
  toggleMember,
  type DraftForm,
  type LineTab,
  type ScopeMode,
  type StartError,
} from "./doc-model";
import { InventoryCountStatusBadge } from "./inventory-counts-page";

const ZONE_ICON: Record<string, LucideIcon> = {
  RECEIVING: PackageOpen,
  MAIN: Boxes,
  QUARANTINE: ShieldAlert,
  SHIPPING: Truck,
  COLD: Snowflake,
  SAFE: LockKeyhole,
};
const day = (iso: string) => formatDate(new Date(`${iso}T00:00:00+05:00`));
const card = "rounded-card border border-border bg-surface shadow-[0_1px_2px_rgba(18,60,58,0.04)]";
const todayIso = () => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);

type T = ReturnType<typeof useTranslations<"inventoryCounts">>;
type Dlg = { title: string; text?: string; items: { icon: LucideIcon; text: string; tone?: "danger" | "info" | "warning" | "success" }[] };

/** Inventarizatsiya hujjati (prototip `InventoryDoc`): qoralama (avtomatik saqlanadi) → sanoq → tekshirish → tasdiq. */
export function InventoryDocPage({ id }: { id: number | null }) {
  const t = useTranslations("inventoryCounts");
  const me = useMe();
  const doc = useInventoryCount(id);
  if (me.data && !canAny(me.data, IN_VIEW_KEYS)) return <ForbiddenState description={t("forbidden")} />;
  if (id === null) return <DraftDoc doc={null} />;
  if (doc.error) return <ErrorState onRetry={() => void doc.refetch()} />;
  if (!doc.data) return <Skeleton className="h-96 w-full" />;
  if (doc.data.status === "DRAFT") return <DraftDoc key={doc.data.id} doc={doc.data} />;
  return <WorkDoc doc={doc.data} />;
}

function whLabel(w: { name: string; branchId: number }, branches: { id: number; name: string }[] | undefined) {
  const b = branches?.find((x) => x.id === w.branchId);
  return b ? `${b.name} · ${w.name}` : w.name;
}

/** Sarlavha, yorliqlar (Hujjat / Tarix) va bannerlar — barcha holatlar uchun. */
function Frame(props: {
  t: T;
  doc: InventoryCountDetail | null;
  place: string;
  scope: string;
  meta?: ReactNode;
  actions: ReactNode;
  banners?: ReactNode;
  children: ReactNode;
}) {
  const { t, doc } = props;
  const [tab, setTab] = useState("doc");
  const st = doc?.status ?? "DRAFT";
  const order = ["DRAFT", "COUNTING", "CHECK", "POSTED"] as const;
  const ci = order.indexOf(st as (typeof order)[number]);
  const steps =
    st === "CANCELLED"
      ? null
      : order.map((k, i) => ({
          label: t(`status.${k}`),
          state: (i < ci || (st === "POSTED" && i === ci) ? "done" : i === ci ? "cur" : "next") as "done" | "cur" | "next",
        }));
  const events = doc?.events ?? [];
  return (
    <div className="flex min-w-0 flex-col gap-4 pb-12">
      <DocumentHeader
        parent={{ label: t("title"), href: "/inventory-counts" }}
        crumb={doc?.number ?? t("doc.newT")}
        crumbMono={!!doc}
        title={doc ? t("doc.docT") : t("doc.newT")}
        number={doc?.number}
        status={<InventoryCountStatusBadge status={st} />}
        sub={
          <>
            <span className="inline-flex items-center gap-1">
              <Warehouse size={14} strokeWidth={1.5} aria-hidden />
              {props.place}
            </span>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1">
              <Layers size={14} strokeWidth={1.5} aria-hidden />
              {props.scope}
            </span>
          </>
        }
        meta={
          <>
            {steps ? <Steps steps={steps} /> : null}
            {props.meta}
          </>
        }
        actions={props.actions}
      />
      {props.banners}
      <Tabs
        aria-label={t("doc.docT")}
        items={[
          { key: "doc", label: t("doc.tabDoc") },
          { key: "hist", label: t("doc.tabHist"), count: doc ? events.length : 0 },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "doc" ? (
        props.children
      ) : (
        <HistoryTimeline
          query={{
            data: events.map((e) => ({ at: e.at, employee: e.who, action: e.kind, reason: e.text ?? undefined })),
            error: null,
            refetch: () => 0,
          }}
          label={(a) => (["create", "start", "submit", "recount", "post", "cancel"].includes(a) ? t(`doc.h_${a}` as "doc.h_create") : a)}
        />
      )}
    </div>
  );
}

function scopeTextOf(t: T, mode: ScopeMode, zoneNames: string[], products: number) {
  const z = mode === "WAREHOUSE" ? t("doc.mWh") : zoneNames.join(", ") || "—";
  return products ? `${z} · ${t("doc.nProd", { n: products })}` : z;
}

function ConfirmList({ items }: { items: Dlg["items"] }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-2 text-body">
          <it.icon
            size={16}
            strokeWidth={1.5}
            aria-hidden
            className={cn(
              "mt-0.5 shrink-0",
              it.tone === "danger" && "text-danger",
              it.tone === "info" && "text-info",
              it.tone === "warning" && "text-warning",
              it.tone === "success" && "text-success",
              !it.tone && "text-text-secondary",
            )}
          />
          <span>{it.text}</span>
        </li>
      ))}
    </ul>
  );
}

// ===== Qoralama =====

function formOf(doc: InventoryCountDetail | null): DraftForm {
  if (!doc)
    return {
      warehouseId: null,
      countDate: isoToDay(todayIso()),
      scopeMode: "ZONES",
      zoneIds: [],
      productIds: [],
      memberIds: [],
      chairId: null,
      blind: true,
    };
  return {
    warehouseId: doc.warehouseId,
    countDate: isoToDay(doc.countDate ?? todayIso()),
    scopeMode: doc.scopeMode,
    zoneIds: doc.zones.map((z) => z.id),
    productIds: doc.products.map((p) => p.id),
    memberIds: doc.members.map((m) => m.id),
    chairId: doc.chairId ?? null,
    blind: doc.blind,
  };
}

function requestOf(f: DraftForm): InventoryCountRequest {
  return {
    warehouseId: f.warehouseId ?? 0,
    scopeMode: f.scopeMode,
    zoneIds: f.scopeMode === "WAREHOUSE" ? [] : f.zoneIds,
    productIds: f.scopeMode === "PRODUCTS" ? f.productIds : [],
    countDate: dayToIso(f.countDate) ?? undefined,
    memberIds: f.memberIds,
    chairId: f.chairId ?? undefined,
    blind: f.blind,
    commission: "",
    note: "",
  };
}

function DraftDoc({ doc }: { doc: InventoryCountDetail | null }) {
  const t = useTranslations("inventoryCounts");
  const router = useRouter();
  const me = useMe();
  const warehouses = useWarehouses();
  const branches = useBranchList();
  const create = useCreateInventoryCount();
  const update = useUpdateInventoryCount();
  const start = useStartInventoryCount();
  const cancel = useCancelInventoryCount();
  const [f, setF] = useState<DraftForm>(() => formOf(doc));
  const [save, setSave] = useState<{ state: "saving" | "saved" | "error"; at?: string } | null>(doc ? { state: "saved" } : null);
  const [tried, setTried] = useState(false);
  const [vs, setVs] = useState<StartError[] | null>(null);
  const [dlg, setDlg] = useState<"start" | "cancel" | null>(null);
  const [reason, setReason] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const opts = useScopeOptions(f.warehouseId);
  const canCreate = can(me.data, IN_CREATE);
  const canOpen = can(me.data, IN_OPEN);
  const o = opts.data;

  useEffect(() => () => (timer.current ? clearTimeout(timer.current) : undefined), []);

  const persist = (next: DraftForm) => {
    if (!canCreate || !next.warehouseId) return;
    if (timer.current) clearTimeout(timer.current);
    setSave({ state: "saving" });
    timer.current = setTimeout(() => {
      const ok = (d: InventoryCountDetail) => {
        setSave({
          state: "saved",
          at: new Date().toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tashkent" }),
        });
        if (!doc) router.replace(`/inventory-counts/${d.id}`);
      };
      const fail = (e: unknown) => {
        setSave({ state: "error" });
        toast({ tone: "danger", title: t("doc.saveErr"), description: describeError(e).message ?? t("doc.retry") });
      };
      if (doc) update.mutate({ id: doc.id, body: requestOf(next) }, { onSuccess: ok, onError: fail });
      else create.mutate(requestOf(next), { onSuccess: ok, onError: fail });
    }, 500);
  };
  const upd = (patch: Partial<DraftForm>) => {
    const next = { ...f, ...patch };
    setF(next);
    persist(next);
  };

  const errs = tried ? startErrors(f, o, doc?.number ?? null) : [];
  const er = (k: StartError["k"]) => {
    const e = errs.find((x) => x.k === k);
    return e ? errText(t, e) : undefined;
  };
  const whs = (warehouses.data ?? []).filter((w) => w.active);
  const wh = whs.find((w) => w.id === f.warehouseId);
  const place = wh ? whLabel(wh, branches.data) : "—";
  const zoneName = (id: number) => o?.zones.find((z) => z.id === id)?.name ?? "";
  const scope = f.warehouseId
    ? scopeTextOf(t, f.scopeMode, f.zoneIds.map(zoneName).filter(Boolean), f.scopeMode === "PRODUCTS" ? f.productIds.length : 0)
    : "—";
  const n = scopeCount(o, f);
  const inZ = (z: number) => f.zoneIds.length === 0 || f.zoneIds.includes(z);
  const prodPool = (o?.products ?? []).filter((p) => p.zones.some((z) => inZ(z.zoneId)));
  const cats = [...new Set(prodPool.map((p) => p.category).filter((c): c is string => !!c))].sort();

  const tryStart = () => {
    setTried(true);
    const e = startErrors(f, o, doc?.number ?? null);
    if (dayToIso(f.countDate) === null) e.unshift({ k: "wh", key: "eWh" });
    if (e.length) return setVs(e);
    setDlg("start");
  };
  const doStart = () => {
    if (!doc) return;
    if (timer.current) clearTimeout(timer.current);
    update.mutate(
      { id: doc.id, body: requestOf(f) },
      {
        onSuccess: () =>
          start.mutate(doc.id, {
            onSuccess: (d) => (setDlg(null), toast({ tone: "success", title: t("doc.tStarted", { n: d.number }) })),
            onError: (e) => (
              setDlg(null),
              toast({ tone: "danger", title: t("doc.failed"), description: describeError(e).message ?? t("doc.retry") })
            ),
          }),
        onError: (e) => (
          setDlg(null),
          toast({ tone: "danger", title: t("doc.failed"), description: describeError(e).message ?? t("doc.retry") })
        ),
      },
    );
  };
  const lockZones =
    f.scopeMode === "WAREHOUSE"
      ? t("doc.mWh")
      : (f.zoneIds.length ? f.zoneIds.map(zoneName) : (o?.zones ?? []).map((z) => z.name)).join(", ");

  return (
    <Frame
      t={t}
      doc={doc}
      place={place}
      scope={scope}
      meta={
        save ? (
          <span
            className={cn("inline-flex items-center gap-1 text-caption", save.state === "error" ? "text-danger" : "text-text-secondary")}
          >
            {save.state === "saved" ? <Check size={12} strokeWidth={2} aria-hidden /> : null}
            {save.state === "saving" ? t("doc.saving") : save.state === "error" ? t("doc.saveErr") : t("doc.saved")}
            {save.state === "saved" && save.at ? ` · ${save.at}` : ""}
          </span>
        ) : null
      }
      actions={
        <>
          {doc && canCreate ? (
            <RowMenu
              label={t("doc.more")}
              items={[
                {
                  key: "cancel",
                  label: t("doc.cancelCount"),
                  icon: <CircleX size={16} strokeWidth={1.5} />,
                  onSelect: () => (setReason(""), setDlg("cancel")),
                },
              ]}
            />
          ) : null}
          {canCreate ? (
            <Button icon={Play} onClick={tryStart} disabled={!doc && !f.warehouseId} loading={start.isPending}>
              {t("doc.start")}
            </Button>
          ) : null}
        </>
      }
      banners={
        vs ? (
          <Alert tone="danger" title={t("doc.vsTitle", { n: vs.length })}>
            <ul className="list-disc pl-4">
              {vs.map((e, i) => (
                <li key={i}>{errText(t, e)}</li>
              ))}
            </ul>
          </Alert>
        ) : null
      }
    >
      <section className={cn(card, "flex flex-col gap-5 px-6 py-5")}>
        <div className="grid grid-cols-1 items-start gap-x-5 gap-y-4 md:grid-cols-3">
          <Select
            label={t("doc.hWh")}
            required
            value={f.warehouseId ? String(f.warehouseId) : null}
            onChange={(v) =>
              upd({
                warehouseId: v ? Number(v) : null,
                zoneIds: [],
                productIds: [],
                memberIds: doc ? f.memberIds : [],
                chairId: doc ? f.chairId : null,
              })
            }
            options={whs
              .filter((w) => !doc || w.branchId === doc.branchId)
              .map((w) => ({ value: String(w.id), label: whLabel(w, branches.data) }))}
            placeholder={t("doc.choose")}
            error={er("wh")}
            searchable
          />
          <TextField
            label={t("doc.hDate")}
            value={f.countDate}
            onChange={(v) => (setF((x) => ({ ...x, countDate: v })), dayToIso(v) ? upd({ countDate: v }) : undefined)}
            placeholder="kk.oo.yyyy"
            inputMode="numeric"
            error={tried && dayToIso(f.countDate) === null ? t("doc.eDate") : undefined}
          />
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="font-medium text-text-secondary">{t("doc.hMode")}</span>
            <div role="radiogroup" aria-label={t("doc.hMode")} className="flex gap-0.5 rounded-control bg-table-header p-0.5">
              {(["WAREHOUSE", "ZONES", "PRODUCTS"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={f.scopeMode === m}
                  onClick={() =>
                    upd({ scopeMode: m, zoneIds: m === "WAREHOUSE" ? [] : f.zoneIds, productIds: m === "PRODUCTS" ? f.productIds : [] })
                  }
                  className={cn(
                    "h-[30px] flex-1 rounded-[6px] px-2 text-[13px] font-medium transition-colors",
                    f.scopeMode === m
                      ? "bg-surface text-text-primary shadow-[0_1px_2px_rgba(18,60,58,0.08)]"
                      : "text-text-secondary hover:text-text-primary",
                  )}
                >
                  {t(m === "WAREHOUSE" ? "doc.mWh" : m === "ZONES" ? "doc.mZones" : "doc.mProducts")}
                </button>
              ))}
            </div>
          </div>
        </div>

        {f.scopeMode !== "WAREHOUSE" && f.warehouseId ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-caption font-medium">
              {t("doc.hZones")}
              {f.scopeMode === "ZONES" ? <span className="text-danger"> *</span> : null}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {(o?.zones ?? []).map((z) => {
                const on = f.zoneIds.includes(z.id);
                const locked = z.lockedBy && z.lockedBy !== doc?.number;
                const I = locked ? Lock : on ? Check : (ZONE_ICON[z.type] ?? Boxes);
                return (
                  <button
                    key={z.id}
                    type="button"
                    aria-pressed={on}
                    title={locked ? t("doc.lockedBy", { n: z.lockedBy ?? "" }) : undefined}
                    onClick={() => upd({ zoneIds: on ? f.zoneIds.filter((x) => x !== z.id) : [...f.zoneIds, z.id] })}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[13px]",
                      on
                        ? "border-primary bg-primary-soft text-primary"
                        : "border-border bg-surface text-text-secondary hover:border-text-disabled",
                      locked && "text-warning",
                    )}
                  >
                    <I size={14} strokeWidth={1.5} aria-hidden />
                    {z.name}
                    <span className="tabular-nums text-text-secondary">{formatQuantity(z.batches)}</span>
                  </button>
                );
              })}
            </div>
            {er("zones") ? <span className="text-caption text-danger">{er("zones")}</span> : null}
          </div>
        ) : null}

        {f.scopeMode === "PRODUCTS" && f.warehouseId ? (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-1 items-start gap-x-5 gap-y-4 md:grid-cols-2">
              <Select
                label={t("doc.hAddProd")}
                required
                value={null}
                onChange={(v) => (v && !f.productIds.includes(Number(v)) ? upd({ productIds: [...f.productIds, Number(v)] }) : undefined)}
                options={prodPool
                  .filter((p) => !f.productIds.includes(p.id))
                  .map((p) => ({
                    value: String(p.id),
                    label: p.name,
                    sub: t("doc.nBatch", { n: p.zones.filter((z) => inZ(z.zoneId)).reduce((a, z) => a + z.batches, 0) }),
                  }))}
                placeholder={t("doc.pickProd")}
                searchable
                error={er("pids")}
              />
              <Select
                label={t("doc.hCat")}
                value={null}
                onChange={(v) =>
                  v
                    ? upd({ productIds: [...new Set([...f.productIds, ...prodPool.filter((p) => p.category === v).map((p) => p.id)])] })
                    : undefined
                }
                options={cats.map((c) => ({ value: c, label: c }))}
                placeholder={t("doc.pickCat")}
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {f.productIds.map((pid) => {
                const name = o?.products.find((p) => p.id === pid)?.name ?? doc?.products.find((p) => p.id === pid)?.name ?? String(pid);
                return (
                  <span
                    key={pid}
                    className="inline-flex h-[30px] items-center gap-1 rounded-full border border-primary bg-primary-soft pr-1 pl-2.5 text-[13px] text-primary"
                  >
                    {name}
                    <button
                      type="button"
                      aria-label={t("doc.removeProd", { p: name })}
                      onClick={() => upd({ productIds: f.productIds.filter((x) => x !== pid) })}
                      className="inline-flex size-5 items-center justify-center rounded-full hover:bg-surface"
                    >
                      <X size={12} strokeWidth={1.5} aria-hidden />
                    </button>
                  </span>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <span className="text-caption font-medium">
            {t("doc.hComm")} <span className="text-danger">*</span>{" "}
            <span className="font-normal text-text-secondary">· {t("doc.commHint")}</span>
          </span>
          <div className="flex flex-wrap gap-1.5">
            {f.warehouseId ? null : <span className="text-caption text-text-secondary">{t("doc.pickWh")}</span>}
            {(o?.staff ?? []).map((m) => {
              const on = f.memberIds.includes(m.id);
              const I = on ? Check : Plus;
              return (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => upd(toggleMember(f, m.id))}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[13px]",
                    on
                      ? "border-primary bg-primary-soft text-primary"
                      : "border-border bg-surface text-text-secondary hover:border-text-disabled",
                  )}
                >
                  <I size={14} strokeWidth={1.5} aria-hidden />
                  {m.name}
                  {on && f.chairId === m.id ? (
                    <span className="rounded-[4px] bg-primary px-1.5 text-[11px] leading-4 font-medium text-white">{t("doc.chair")}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
          {f.memberIds.length > 1 ? (
            <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-text-secondary">
              {t("doc.chairPick")}
              {f.memberIds.map((mid) => {
                const on = f.chairId === mid;
                return (
                  <button
                    key={mid}
                    type="button"
                    aria-pressed={on}
                    onClick={() => upd({ chairId: mid })}
                    className={cn(
                      "h-[26px] rounded-[6px] border px-2 text-[12.5px]",
                      on ? "border-primary bg-primary text-white" : "border-border bg-surface text-text-primary hover:border-text-disabled",
                    )}
                  >
                    {o?.staff.find((s) => s.id === mid)?.name ?? doc?.members.find((s) => s.id === mid)?.name ?? mid}
                  </button>
                );
              })}
            </div>
          ) : null}
          {er("comm") ? <span className="text-caption text-danger">{er("comm")}</span> : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <Switch
            label={t("doc.blind")}
            description={f.blind ? t("doc.blindOn") : t("doc.blindOff")}
            checked={f.blind}
            disabled={!canOpen}
            onChange={(v) => upd({ blind: v })}
          />
          <span className="inline-flex items-center gap-1.5 text-[13px] text-text-secondary">
            <ListChecks size={16} strokeWidth={1.5} aria-hidden />
            {f.warehouseId ? t("doc.scopeN", { n: formatQuantity(n) }) : t("doc.pickWh")}
            {er("scope") ? <span className="text-danger"> · {er("scope")}</span> : null}
          </span>
        </div>
      </section>

      <Modal
        open={dlg === "start"}
        onClose={() => setDlg(null)}
        title={t("doc.dStartT")}
        primaryAction={{ label: t("doc.start"), onClick: doStart, loading: start.isPending || update.isPending }}
        secondaryAction={{ label: t("doc.keep"), onClick: () => setDlg(null) }}
      >
        <ConfirmList
          items={[
            { icon: Lock, tone: "warning", text: t("doc.cfLock", { z: lockZones }) },
            { icon: Camera, text: t("doc.cfSnap", { n: formatQuantity(n) }) },
            { icon: f.blind ? EyeOff : Eye, text: f.blind ? t("doc.cfBlind") : t("doc.cfOpen") },
          ]}
        />
      </Modal>
      {doc ? (
        <Modal
          open={dlg === "cancel"}
          onClose={() => setDlg(null)}
          tone="danger"
          title={t("doc.dCancT", { n: doc.number })}
          primaryAction={{
            label: t("doc.cancelCount"),
            disabled: !reason.trim(),
            loading: cancel.isPending,
            onClick: () =>
              cancel.mutate(
                { id: doc.id, reason },
                {
                  onSuccess: (d) => (setDlg(null), toast({ tone: "success", title: t("doc.tCancelled", { n: d.number }) })),
                  onError: (e) =>
                    toast({ tone: "danger", title: t("doc.failed"), description: describeError(e).message ?? t("doc.retry") }),
                },
              ),
          }}
          secondaryAction={{ label: t("doc.keep"), onClick: () => setDlg(null) }}
        >
          <TextField label={t("doc.reason")} value={reason} onChange={setReason} maxLength={300} required />
        </Modal>
      ) : null}
    </Frame>
  );
}

function errText(t: T, e: StartError): string {
  if (e.key === "eBusy") return t("doc.eBusy", { z: e.z, n: e.n });
  return t(`doc.${e.key}`);
}

// ===== Sanoq / Tekshirish / Yakunlangan =====

function WorkDoc({ doc }: { doc: InventoryCountDetail }) {
  const t = useTranslations("inventoryCounts");
  const me = useMe();
  const warehouses = useWarehouses();
  const branches = useBranchList();
  const recount = useRecountInventoryCount();
  const approve = useApproveInventoryCount();
  const cancel = useCancelInventoryCount();
  const note = useLineNote();
  const router = useRouter();
  const [tab, setTab] = useState<LineTab>("all");
  const [sel, setSel] = useState<string[]>([]);
  const [dlg, setDlg] = useState<"post" | "cancel" | "noCancel" | "note" | null>(null);
  const [reason, setReason] = useState("");
  const [noteLine, setNoteLine] = useState<InventoryCountLine | null>(null);
  const st = doc.status;
  const counting = st === "COUNTING";
  const isCheck = st === "CHECK";
  const isRes = !counting;
  const canCreate = can(me.data, IN_CREATE);
  const canCount = can(me.data, IN_COUNT);
  const level = can(me.data, IN_APPROVE) && (!doc.needsDirector || can(me.data, IN_DIRECTOR));
  const cost = doc.lines.some((l) => l.cost != null) || doc.shortageCost != null;
  const wh = warehouses.data?.find((w) => w.id === doc.warehouseId);
  const place = wh ? whLabel(wh, branches.data) : doc.warehouse;
  const zoneNames = doc.zones.map((z) => z.name);
  const scope = scopeTextOf(t, doc.scopeMode, zoneNames, doc.products.length);
  const lockedZones =
    doc.scopeMode === "WAREHOUSE" ? t("doc.mWh") : [...new Set(doc.lines.map((l) => l.zone.name))].join(", ") || zoneNames.join(", ");
  const fail = (e: unknown) => toast({ tone: "danger", title: t("doc.failed"), description: describeError(e).message ?? t("doc.retry") });
  const at = (iso?: string | null) => (iso ? formatDateTime(new Date(iso)) : "—");

  const doRecount = (ids: number[]) =>
    recount.mutate(
      { id: doc.id, lineIds: ids },
      { onSuccess: () => (setSel([]), setTab("all"), toast({ tone: "info", title: t("doc.tRecount", { n: ids.length }) })), onError: fail },
    );

  // Bannerlar
  const banners: { tone: "info" | "warning" | "danger" | "success"; icon: LucideIcon; title?: string; text?: string }[] = [];
  if (counting) {
    banners.push({
      tone: "info",
      icon: Lock,
      title: t("doc.bCountT", { at: at(doc.startedAt), who: doc.startedBy ?? "—" }),
      text: t("doc.bCount", { z: lockedZones, d: formatQuantity(doc.counted), n: formatQuantity(doc.lines.length) }),
    });
    if (doc.bookHidden) banners.push({ tone: "info", icon: EyeOff, text: t("doc.bBlind") });
  }
  if (isCheck) {
    const ctrlDiff = doc.lines.some((l) => l.controlled && (l.diff ?? 0) !== 0);
    if (ctrlDiff) banners.push({ tone: "danger", icon: ShieldAlert, title: t("doc.bCtrlT"), text: t("doc.bCtrl") });
    banners.push(
      doc.needsDirector
        ? { tone: "warning", icon: ShieldAlert, text: t("doc.bDir", { s: doc.shortageCost ? formatMoney(doc.shortageCost) : "" }) }
        : { tone: "info", icon: Info, text: t("doc.bBranch") },
    );
  }
  if (st === "POSTED")
    banners.push({ tone: "success", icon: CircleCheck, text: t("doc.bPosted", { at: at(doc.postedAt), who: doc.postedBy ?? "—" }) });
  if (st === "CANCELLED")
    banners.push({
      tone: "warning",
      icon: CircleX,
      title: t("doc.bCancelled", { at: at(doc.cancelledAt), who: doc.cancelledBy ?? "—" }),
      text: doc.cancelReason ?? undefined,
    });

  // Harakatlar
  const more: { key: string; label: string; icon: ReactNode; onSelect: () => void }[] = [
    {
      key: "print",
      label: t("doc.print"),
      icon: <Printer size={16} strokeWidth={1.5} />,
      onSelect: () => window.open(`/api/inventory-counts/${doc.id}/pdf`, "_blank", "noopener"),
    },
  ];
  if ((counting || isCheck) && canCreate)
    more.push({
      key: "cancel",
      label: t("doc.cancelCount"),
      icon: <CircleX size={16} strokeWidth={1.5} />,
      onSelect: () => (setReason(""), setDlg("cancel")),
    });
  if (st === "POSTED")
    more.push({
      key: "noCancel",
      label: t("drawer.cancel"),
      icon: <CircleX size={16} strokeWidth={1.5} />,
      onSelect: () => setDlg("noCancel"),
    });

  // Qatorlar
  const tabs = lineTabs(isRes);
  const shown = doc.lines.filter(lineFilter(tab));
  const tabLabel: Record<LineTab, string> = {
    all: t("doc.vAll"),
    todo: t("doc.vTodo"),
    done: t("doc.vDone"),
    diff: t("doc.vDiff"),
    short: t("doc.vShort"),
    over: t("doc.vOver"),
  };
  const statusOf = (l: InventoryCountLine) => {
    const d = l.diff;
    if (l.countedQty == null || d == null)
      return (
        <Badge tone="neutral" icon={CircleDashed}>
          {t("doc.dTodo")}
        </Badge>
      );
    if (d < 0)
      return (
        <Badge tone="danger" icon={CircleMinus}>
          {t("doc.dShort", { n: formatQuantity(-d) })}
        </Badge>
      );
    if (d > 0)
      return (
        <Badge tone="info" icon={CirclePlus}>
          {t("doc.dOver", { n: formatQuantity(d) })}
        </Badge>
      );
    return (
      <Badge tone="success" icon={CircleCheck}>
        {t("doc.dOk")}
      </Badge>
    );
  };
  const columns: TableColumn<InventoryCountLine>[] = [
    {
      key: "p",
      title: t("doc.cProduct"),
      wrap: true,
      render: (l) => {
        const subs = [l.controlled && t("doc.ctrl"), l.added && t("doc.foundTag"), l.recount && t("doc.recountTag")]
          .filter(Boolean)
          .join(" · ");
        const expired = l.expiryDate < todayIso();
        return (
          <span className="flex flex-col">
            <span className="flex flex-wrap items-center gap-2 font-medium">
              {l.productName}
              {expired ? (
                <Badge tone="danger" icon={ShieldAlert}>
                  {t("doc.toQuar")}
                </Badge>
              ) : null}
            </span>
            {subs ? <span className="text-caption text-text-secondary">{subs}</span> : null}
          </span>
        );
      },
    },
    { key: "b", title: t("doc.cBatch"), mono: true, render: (l) => l.batchNumber },
    {
      key: "e",
      title: t("doc.cExp"),
      render: (l) => <span className={l.expiryDate < todayIso() ? "text-danger" : "text-text-secondary"}>{day(l.expiryDate)}</span>,
    },
    { key: "z", title: t("doc.cZone"), render: (l) => <span className="text-text-secondary">{l.zone.name}</span> },
    ...(doc.bookHidden
      ? []
      : [
          {
            key: "bk",
            title: t("doc.cBook"),
            align: "right" as const,
            render: (l: InventoryCountLine) => (
              <span className="text-text-secondary">{l.bookQty != null ? formatQuantity(l.bookQty) : "—"}</span>
            ),
          },
        ]),
    {
      key: "c",
      title: t("doc.cCounted"),
      align: "right",
      render: (l) => (
        <span className={cn("font-semibold", l.countedQty == null && "text-text-disabled")}>
          {l.countedQty == null ? "—" : formatQuantity(l.countedQty)}
        </span>
      ),
    },
    ...(isRes ? [{ key: "d", title: t("doc.cDiff"), render: statusOf }] : []),
    ...(isRes && cost
      ? [
          {
            key: "cost",
            title: t("doc.cCost"),
            align: "right" as const,
            render: (l: InventoryCountLine) => <span className="text-text-secondary">{l.cost ? formatMoney(l.cost) : "—"}</span>,
          },
          {
            key: "ds",
            title: t("doc.cDiffSum"),
            align: "right" as const,
            render: (l: InventoryCountLine) =>
              l.diff && l.diffAmount ? (
                <span className={cn("font-semibold", l.diff < 0 ? "text-danger" : "text-info")}>{formatMoney(l.diffAmount)}</span>
              ) : (
                <span className="text-text-disabled">—</span>
              ),
          },
        ]
      : []),
    {
      key: "n",
      title: t("doc.cNote"),
      wrap: true,
      render: (l) => <span className={l.note ? "" : "text-text-disabled"}>{l.note || "—"}</span>,
    },
  ];
  const short = `${formatQuantity(doc.shortageQty)}${cost && doc.shortageCost ? ` · ${formatMoney(doc.shortageCost)}` : ""}`;
  const over = `${formatQuantity(doc.surplusQty)}${cost && doc.surplusCost ? ` · ${formatMoney(doc.surplusCost)}` : ""}`;
  const net =
    cost && doc.surplusCost && doc.shortageCost
      ? formatMoney((Number(doc.surplusCost) - Number(doc.shortageCost)).toFixed(2))
      : `${doc.surplusQty - doc.shortageQty > 0 ? "+" : ""}${formatQuantity(doc.surplusQty - doc.shortageQty)}`;

  const postItems: Dlg["items"] = [];
  if (!doc.shortageQty && !doc.surplusQty) postItems.push({ icon: CircleCheck, tone: "success", text: t("doc.cfNoDiff") });
  if (doc.shortageQty)
    postItems.push({
      icon: TrendingDown,
      tone: "danger",
      text: t("doc.cfShort", {
        q: formatQuantity(doc.shortageQty),
        s: cost && doc.shortageCost ? ` · ${formatMoney(doc.shortageCost)}` : "",
      }),
    });
  if (doc.surplusQty)
    postItems.push({
      icon: TrendingUp,
      tone: "info",
      text: t("doc.cfOver", { q: formatQuantity(doc.surplusQty), s: cost && doc.surplusCost ? ` · ${formatMoney(doc.surplusCost)}` : "" }),
    });
  postItems.push({ icon: LockOpen, text: t("doc.cfUnlock") });

  return (
    <Frame
      t={t}
      doc={doc}
      place={place}
      scope={scope}
      actions={
        <>
          <RowMenu label={t("doc.more")} items={more} />
          {counting ? (
            <Button icon={ScanLine} onClick={() => router.push(`/inventory-counts/${doc.id}/count`)}>
              {t("doc.openCount")}
            </Button>
          ) : null}
          {isCheck && level ? (
            <Button icon={Check} loading={approve.isPending} onClick={() => setDlg("post")}>
              {t("doc.post")}
            </Button>
          ) : null}
        </>
      }
      banners={banners.map((b, i) => (
        <Alert key={i} tone={b.tone} icon={b.icon} title={b.title ?? b.text ?? ""}>
          {b.title ? b.text : null}
        </Alert>
      ))}
    >
      <InfoCard
        title={t("doc.head")}
        rows={[
          [t("doc.hWh"), place],
          [t("doc.hMode"), scope],
          [t("doc.hDate"), doc.countDate ? day(doc.countDate) : "—"],
          [
            t("doc.hComm"),
            doc.members.length
              ? doc.members.map((m) => (m.id === doc.chairId ? `${m.name} (${t("doc.chair")})` : m.name)).join(", ")
              : (doc.commission ?? "—"),
          ],
          [t("doc.hMode2"), doc.blind ? t("doc.blind") : t("doc.openMode")],
          ...(doc.startedAt ? [[t("doc.hSnap"), at(doc.startedAt)] as [string, string]] : []),
        ]}
      />
      <section className={cn(card, "min-w-0")}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <Tabs
            aria-label={t("drawer.linesCaption")}
            items={tabs.map((k) => ({ key: k, label: tabLabel[k], count: doc.lines.filter(lineFilter(k)).length }))}
            value={tab}
            onChange={(k) => (setTab(k as LineTab), setSel([]))}
          />
        </div>
        <Table
          caption={t("drawer.linesCaption")}
          columns={columns}
          rows={shown}
          rowKey={(l) => String(l.id)}
          density="compact"
          selectable={isCheck && canCount}
          selectedKeys={sel}
          onSelectionChange={setSel}
          bulkActions={
            <div className="flex items-center gap-3">
              <span className="text-caption text-text-secondary">{t("doc.nSel", { n: sel.length })}</span>
              <Button variant="secondary" icon={RotateCcw} loading={recount.isPending} onClick={() => doRecount(sel.map(Number))}>
                {t("doc.recount")}
              </Button>
            </div>
          }
          rowActions={
            isCheck
              ? (l) => (
                  <RowMenu
                    items={[
                      {
                        key: "note",
                        label: t("doc.aNote"),
                        icon: <MessageSquare size={16} strokeWidth={1.5} />,
                        onSelect: () => (setNoteLine(l), setReason(l.note ?? ""), setDlg("note")),
                      },
                      ...(canCount && !l.added
                        ? [
                            {
                              key: "recount",
                              label: t("doc.recount"),
                              icon: <RotateCcw size={16} strokeWidth={1.5} />,
                              onSelect: () => doRecount([l.id]),
                            },
                          ]
                        : []),
                    ]}
                  />
                )
              : undefined
          }
          emptyState={<div className="px-4 py-8 text-center text-[13px] text-text-secondary">{t("doc.noDiff")}</div>}
        />
        {isRes ? (
          <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1 rounded-b-card border-t border-border bg-table-header px-4 py-3 text-[13px] tabular-nums">
            <span>
              <span className="text-text-secondary">{cost ? t("doc.tShort") : t("doc.tShortQ")}: </span>
              <span className="font-medium text-danger">{short}</span>
            </span>
            <span>
              <span className="text-text-secondary">{cost ? t("doc.tOver") : t("doc.tOverQ")}: </span>
              <span className="font-medium text-info">{over}</span>
            </span>
            <span>
              <span className="text-text-secondary">{t("doc.tNet")}: </span>
              <span className="text-base font-semibold">{net}</span>
            </span>
          </div>
        ) : null}
      </section>

      <Modal
        open={dlg === "post"}
        onClose={() => setDlg(null)}
        title={t("doc.dPostT", { n: doc.number })}
        primaryAction={{
          label: t("doc.post"),
          loading: approve.isPending,
          onClick: () =>
            approve.mutate(doc.id, {
              onSuccess: (d) => (setDlg(null), toast({ tone: "success", title: t("doc.tPosted", { n: d.number }) })),
              onError: (e) => (setDlg(null), fail(e)),
            }),
        }}
        secondaryAction={{ label: t("doc.keep"), onClick: () => setDlg(null) }}
      >
        <ConfirmList items={postItems} />
      </Modal>
      <Modal
        open={dlg === "cancel"}
        onClose={() => setDlg(null)}
        tone="danger"
        title={t("doc.dCancT", { n: doc.number })}
        primaryAction={{
          label: t("doc.cancelCount"),
          disabled: !reason.trim(),
          loading: cancel.isPending,
          onClick: () =>
            cancel.mutate(
              { id: doc.id, reason },
              { onSuccess: (d) => (setDlg(null), toast({ tone: "success", title: t("doc.tCancelled", { n: d.number }) })), onError: fail },
            ),
        }}
        secondaryAction={{ label: t("doc.keep"), onClick: () => setDlg(null) }}
      >
        <p className="mb-3 flex items-start gap-2 text-text-secondary">
          <LockOpen size={16} strokeWidth={1.5} aria-hidden className="mt-0.5 shrink-0" />
          {t("doc.dCancD")}
        </p>
        <TextField label={t("doc.reason")} value={reason} onChange={setReason} maxLength={300} required />
      </Modal>
      <Modal
        open={dlg === "noCancel"}
        onClose={() => setDlg(null)}
        title={t("doc.noCancelT")}
        primaryAction={{ label: t("doc.understood"), onClick: () => setDlg(null) }}
      >
        <p className="text-text-secondary">{t("doc.noCancelD")}</p>
      </Modal>
      <Modal
        open={dlg === "note" && !!noteLine}
        onClose={() => setDlg(null)}
        title={t("doc.aNote")}
        primaryAction={{
          label: t("doc.saveNote"),
          loading: note.isPending,
          onClick: () =>
            noteLine &&
            note.mutate(
              { id: doc.id, lineId: noteLine.id, note: reason },
              { onSuccess: () => (setDlg(null), toast({ tone: "success", title: t("doc.noteSaved") })), onError: fail },
            ),
        }}
        secondaryAction={{ label: t("doc.keep"), onClick: () => setDlg(null) }}
      >
        {noteLine ? <ConfirmList items={[{ icon: Package, text: `${noteLine.productName} · ${noteLine.batchNumber}` }]} /> : null}
        <div className="mt-3">
          <TextField label={t("doc.cNote")} value={reason} onChange={setReason} maxLength={300} />
        </div>
      </Modal>
    </Frame>
  );
}

function InfoCard({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <section className={cn(card, "px-6 py-5")}>
      <h2 className="mb-3 text-subtitle">{title}</h2>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(([k, v]) => (
          <div key={k} className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-caption text-text-secondary">{k}</dt>
            <dd className="text-body break-words">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
