"use client";

import { ArchiveX, Ellipsis, Pencil, Plus, Power, RotateCcw, Snowflake, Warehouse as WarehouseIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/modal";
import { RowMenu, type RowMenuItem } from "@/components/ui/row-menu";
import { Select } from "@/components/ui/select";
import { EmptyState, ErrorState, ForbiddenState } from "@/components/ui/system-states";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { useEmployees } from "@/features/employees/api";
import { describeError } from "@/features/setup/form-error";
import { WarehousePanel, ZONE_LOOK, useZoneNames } from "@/features/setup/warehouse-panel";
import { formatQuantity } from "@/lib/format";
import { cn } from "@/lib/cn";
import {
  OPTIONAL_ZONES,
  activeZoneCount,
  useActivateWarehouse,
  useAddNamedZone,
  useBranchList,
  useCreateWarehouseCard,
  useDeactivateWarehouse,
  useSetZoneActive,
  useUpdateWarehouseCard,
  useWarehouseOverview,
  useWarehouses,
  warehouseTree,
  type WarehouseOverviewItem,
  type WarehouseZoneStock,
  type ZoneType,
} from "./api";
import { DeactivateDialog } from "./deactivate-dialog";

function ActivePill({ active }: { active: boolean }) {
  const t = useTranslations("organization.warehouses");
  return <Badge tone={active ? "success" : "neutral"}>{active ? t("stActive") : t("stClosed")}</Badge>;
}

/** Boshqaruv → Omborlar va zonalar (prototip AdminOrg): chapda filial → ombor daraxti, oʻngda ombor maʼlumotlari va zonalar. */
export function WarehousesPage() {
  const t = useTranslations("organization.warehouses");
  const me = useMe();
  const overview = useWarehouseOverview();
  const canEdit = !!me.data && can(me.data, "warehouses.view");
  const [selected, setSelected] = useState<number | null>(null);
  const [panel, setPanel] = useState<{ id: number | null; branchId: number | null } | null>(null);
  const [closing, setClosing] = useState<WarehouseOverviewItem | null>(null);
  const [zoneClosing, setZoneClosing] = useState<WarehouseZoneStock | null>(null);
  const [adding, setAdding] = useState(false);
  const deactivate = useDeactivateWarehouse();
  const activate = useActivateWarehouse();
  const setZoneActive = useSetZoneActive();

  if (me.data && !canEdit) return <ForbiddenState description={t("forbidden")} />;

  const items = overview.data ?? [];
  const sel = items.find((w) => w.id === selected) ?? items[0];
  const tree = warehouseTree(items);

  function zoneActive(zone: WarehouseZoneStock, active: boolean) {
    if (!sel) return;
    setZoneActive.mutate(
      { id: sel.id, zoneId: zone.id, active },
      {
        onSuccess: () => {
          toast({ tone: "success", title: active ? t("zReopened") : t("zClosedToast"), description: `${zone.name} · ${sel.name}` });
          setZoneClosing(null);
        },
        onError: (e) => toast({ tone: "danger", title: t("zFail"), description: describeError(e).message ?? "" }),
      },
    );
  }

  return (
    <>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex items-baseline gap-2 text-page-title">
            {t("title")}
            {overview.data ? <span className="text-body font-normal text-text-secondary tabular-nums">{formatQuantity(items.length)}</span> : null}
          </h1>
          <p className="mt-1 text-body text-text-secondary">{t("subtitle", { z: formatQuantity(activeZoneCount(items)) })}</p>
        </div>
        <Button icon={Plus} onClick={() => setPanel({ id: null, branchId: sel?.branchId ?? null })}>
          {t("new")}
        </Button>
      </div>

      {overview.error ? (
        <ErrorState onRetry={() => overview.refetch()} />
      ) : overview.isPending ? (
        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]" aria-busy>
          <div className="h-64 animate-pulse rounded-lg bg-table-header" />
          <div className="h-64 animate-pulse rounded-lg bg-table-header" />
        </div>
      ) : !sel ? (
        <EmptyState icon={WarehouseIcon} title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <nav aria-label={t("treeLabel")} className="flex flex-col gap-[2px] rounded-lg border border-border bg-surface p-2">
            {tree.map((g) => (
              <div key={g.branchId} className="flex flex-col gap-[2px]">
                <div className="flex justify-between gap-2 px-2 pt-[10px] pb-1 text-caption font-semibold text-text-secondary">
                  <span>{g.name}</span>
                  <span className="font-mono font-normal text-text-secondary">{g.code}</span>
                </div>
                {g.items.map((w) => {
                  const on = w.id === sel.id;
                  const cold = w.zones.some((z) => z.active && z.type === "COLD");
                  return (
                    <button
                      key={w.id}
                      type="button"
                      aria-current={on ? "true" : undefined}
                      onClick={() => setSelected(w.id)}
                      className={cn(
                        "flex min-h-10 items-center gap-[10px] rounded-md px-2 py-[6px] text-left",
                        on ? "bg-primary-soft" : "hover:bg-table-header",
                      )}
                    >
                      <Icon icon={cold ? Snowflake : WarehouseIcon} size="sm" className={on ? "text-primary" : "text-text-secondary"} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className={cn("truncate text-table", on ? "font-semibold" : "font-medium")}>{w.name}</span>
                        <span className="text-caption text-text-secondary">
                          {t("zN", { n: formatQuantity(activeZoneCount([w])) })}
                          {cold ? ` · ${t("coldShort")}` : ""}
                        </span>
                      </span>
                      {!w.active ? <Badge tone="neutral">{t("stClosed")}</Badge> : null}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>

          <WarehouseDetail
            w={sel}
            onEdit={() => setPanel({ id: sel.id, branchId: sel.branchId })}
            onClose={() => (sel.active ? (deactivate.reset(), setClosing(sel)) : toast({ tone: "info", title: t("alreadyClosed") }))}
            onActivate={() =>
              activate.mutate(sel.id, {
                onSuccess: () => toast({ tone: "success", title: t("activated"), description: sel.name }),
                onError: (e) => toast({ tone: "danger", title: t("activateFailed"), description: describeError(e).message ?? "" }),
              })
            }
            onAddZone={() => setAdding(true)}
            onZoneClose={(z) => setZoneClosing(z)}
            onZoneReopen={(z) => zoneActive(z, true)}
          />
        </div>
      )}

      {panel ? <CardPanel id={panel.id} branchId={panel.branchId} onClose={() => setPanel(null)} onSaved={(id) => setSelected(id)} /> : null}

      {closing ? (
        <DeactivateDialog
          title={t("closeTitle", { n: closing.name })}
          consequence={t("deactivateConsequence")}
          actionLabel={t("close")}
          pending={deactivate.isPending}
          error={deactivate.error}
          onClose={() => setClosing(null)}
          onConfirm={(reason) =>
            deactivate.mutate(
              { id: closing.id, reason },
              { onSuccess: () => (toast({ tone: "success", title: t("deactivated"), description: closing.name }), setClosing(null)) },
            )
          }
        />
      ) : null}

      <Modal
        open={zoneClosing !== null}
        onClose={() => setZoneClosing(null)}
        tone="danger"
        size="sm"
        title={t("zCloseT", { n: zoneClosing?.name ?? "" })}
        primaryAction={{
          label: t("zCloseOk"),
          loading: setZoneActive.isPending,
          onClick: () => zoneClosing && zoneActive(zoneClosing, false),
        }}
      >
        <p className="text-body">{t("zCloseText")}</p>
      </Modal>

      {adding && sel ? <AddZoneModal w={sel} onClose={() => setAdding(false)} /> : null}
    </>
  );
}

function WarehouseDetail({
  w,
  onEdit,
  onClose,
  onActivate,
  onAddZone,
  onZoneClose,
  onZoneReopen,
}: {
  w: WarehouseOverviewItem;
  onEdit: () => void;
  onClose: () => void;
  onActivate: () => void;
  onAddZone: () => void;
  onZoneClose: (z: WarehouseZoneStock) => void;
  onZoneReopen: (z: WarehouseZoneStock) => void;
}) {
  const t = useTranslations("organization.warehouses");
  const zoneNames = useZoneNames();
  const active = w.zones.filter((z) => z.active);
  const info: [string, string][] = [
    [t("address"), w.address ?? "—"],
    [t("keepers"), w.keeperName ?? t("noKeeper")],
    [t("ctrlL"), active.some((z) => z.type === "SAFE") ? t("ctrlYes") : t("no")],
    [t("coldL"), active.some((z) => z.type === "COLD") ? t("yes") : t("no")],
  ];

  function zoneMenu(z: WarehouseZoneStock): RowMenuItem[] {
    if (!z.active) {
      return [{ key: "reopen", label: t("zReopen"), icon: <Icon icon={RotateCcw} size="sm" />, onSelect: () => onZoneReopen(z) }];
    }
    return [{ key: "close", label: t("zClose"), icon: <Icon icon={ArchiveX} size="sm" />, onSelect: () => onZoneClose(z) }];
  }

  return (
    <section className="flex min-w-0 flex-col gap-4" aria-labelledby="wh-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-[2px]">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="wh-title" className="text-section-title">
              {w.name}
            </h2>
            <ActivePill active={w.active} />
          </div>
          <span className="text-table text-text-secondary">{w.branchName}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {w.active ? (
            <Button variant="secondary" size="sm" icon={ArchiveX} onClick={onClose}>
              {t("close")}
            </Button>
          ) : (
            <Button variant="secondary" size="sm" icon={Power} onClick={onActivate}>
              {t("activate")}
            </Button>
          )}
          <Button variant="secondary" size="sm" icon={Pencil} onClick={onEdit}>
            {t("edit")}
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface">
        <h3 className="border-b border-border px-4 py-3 text-subtitle">{t("info")}</h3>
        <dl className="grid gap-x-6 gap-y-3 p-4 sm:grid-cols-2">
          {info.map(([label, value]) => (
            <div key={label} className="flex min-w-0 flex-col gap-[2px]">
              <dt className="text-caption text-text-secondary">{label}</dt>
              <dd className="text-body">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-[14px]">
          <h3 className="text-subtitle">
            {t("zonesT")} <span className="font-normal text-text-secondary">{formatQuantity(w.zones.length)}</span>
          </h3>
          <Button variant="tertiary" size="sm" icon={Plus} onClick={onAddZone}>
            {t("zAdd")}
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-body">
            <caption className="sr-only">{t("zonesT")}</caption>
            <thead className="bg-table-header text-caption font-medium text-text-secondary">
              <tr>
                <th scope="col" className="px-4 py-[10px] text-left font-medium">
                  {t("zType")}
                </th>
                <th scope="col" className="px-3 py-[10px] text-left font-medium">
                  {t("zName")}
                </th>
                <th scope="col" className="px-3 py-[10px] text-left font-medium">
                  {t("zSale")}
                </th>
                <th scope="col" className="px-3 py-[10px] text-right font-medium">
                  {t("zStock")}
                </th>
                <th scope="col" className="px-3 py-[10px] text-left font-medium">
                  {t("status")}
                </th>
                <th scope="col" className="w-12 px-3 py-[10px]">
                  <span className="sr-only">{t("rowMenu")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {w.zones.map((z) => {
                const look = ZONE_LOOK[z.type];
                return (
                  <tr key={z.id} className={cn("border-t border-border", !z.active && "opacity-60")}>
                    <td className="px-4 py-[6px]">
                      <span className="flex min-h-9 items-center gap-2">
                        <span className={cn("flex size-7 flex-none items-center justify-center rounded-md", look.className)}>
                          <Icon icon={look.icon} size="sm" />
                        </span>
                        <span className="truncate text-table">{zoneNames[z.type]}</span>
                      </span>
                    </td>
                    <td className="px-3 py-[6px] font-medium">{z.name}</td>
                    <td className={cn("px-3 py-[6px] text-table", z.sellable ? "text-success" : "text-text-secondary")}>
                      {z.sellable ? t("saleOpen") : t("saleClosed")}
                    </td>
                    <td className="px-3 py-[6px] text-right tabular-nums">
                      <span className="flex flex-col items-end">
                        <span>{t("pcs", { n: formatQuantity(z.qty) })}</span>
                        <span className="text-caption text-text-secondary">{t("prodN", { n: formatQuantity(z.products) })}</span>
                      </span>
                    </td>
                    <td className="px-3 py-[6px]">
                      <ActivePill active={z.active} />
                    </td>
                    <td className="px-3 py-[6px] text-right">
                      {OPTIONAL_ZONES.includes(z.type) || !z.active ? (
                        <RowMenu items={zoneMenu(z)} label={t("rowMenu")} />
                      ) : (
                        <span className="inline-flex size-[30px] items-center justify-center text-text-disabled" title={t("required")}>
                          <Icon icon={Ellipsis} size="sm" aria-hidden />
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/** «Zona qoʻshish» (prototip): omborda hali yoʻq ixtiyoriy tur (Sovuq / Seyf) va nom. */
function AddZoneModal({ w, onClose }: { w: WarehouseOverviewItem; onClose: () => void }) {
  const t = useTranslations("organization.warehouses");
  const zoneNames = useZoneNames();
  const free = OPTIONAL_ZONES.filter((type) => !w.zones.some((z) => z.type === type));
  const [type, setType] = useState<ZoneType | null>(free[0] ?? null);
  const [name, setName] = useState(free[0] ? zoneNames[free[0]] : "");
  const [tried, setTried] = useState(false);
  const add = useAddNamedZone();
  const nm = name.trim();
  const dup = !!nm && w.zones.some((z) => z.name.trim().toLocaleLowerCase("uz") === nm.toLocaleLowerCase("uz"));
  const err = tried && !nm ? t("eReq") : dup ? t("eDup") : undefined;

  function submit() {
    setTried(true);
    if (!type || !nm || dup) return;
    add.mutate(
      { id: w.id, type, name: nm },
      {
        onSuccess: () => (toast({ tone: "success", title: t("zAdded", { zone: nm }), description: w.name }), onClose()),
      },
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t("zAddT", { w: w.name })}
      primaryAction={{ label: t("zAdd"), onClick: submit, loading: add.isPending, disabled: !type }}
    >
      {!type ? (
        <Alert tone="info">{t("allZones")}</Alert>
      ) : (
        <div className="flex flex-col gap-4">
          <Select
            label={t("zType")}
            value={type}
            onChange={(v) => {
              const next = (v as ZoneType | null) ?? type;
              if (name.trim() === zoneNames[type]) setName(zoneNames[next]);
              setType(next);
            }}
            options={free.map((f) => ({ value: f, label: zoneNames[f] }))}
          />
          <TextField label={t("zName")} value={name} onChange={setName} error={err} maxLength={100} />
          <p className="text-caption text-text-secondary">{t("requiredNote")}</p>
          {add.error ? <Alert tone="danger">{describeError(add.error).message}</Alert> : null}
        </div>
      )}
    </Modal>
  );
}

/** Ombor kartasi (prototip WarehousePanel): yangi yoki mavjud ombor — tur, masʼul, zonalar. */
function CardPanel({
  id,
  branchId,
  onClose,
  onSaved,
}: {
  id: number | null;
  branchId: number | null;
  onClose: () => void;
  onSaved: (id: number) => void;
}) {
  const t = useTranslations("organization.warehouses");
  const branches = useBranchList();
  const warehouses = useWarehouses();
  const employees = useEmployees();
  const create = useCreateWarehouseCard();
  const update = useUpdateWarehouseCard();
  const warehouse = id == null ? null : (warehouses.data?.find((w) => w.id === id) ?? null);
  if (!branches.data || !warehouses.data || (id != null && !warehouse)) return null;
  return (
    <WarehousePanel
      open
      warehouse={warehouse}
      presetBranchId={branchId}
      branches={branches.data}
      employees={employees.data ?? []}
      onClose={onClose}
      onSave={async (body) => {
        const saved = warehouse ? await update.mutateAsync({ id: warehouse.id, body }) : await create.mutateAsync(body);
        toast({ tone: "success", title: warehouse ? t("saved") : t("added"), description: saved.name });
        onSaved(saved.id);
      }}
    />
  );
}
