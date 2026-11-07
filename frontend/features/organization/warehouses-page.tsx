"use client";

import {
  CircleCheck,
  CirclePause,
  Lock,
  Pencil,
  Plus,
  Power,
  PowerOff,
  ShoppingCart,
  Snowflake,
  Vault,
  Warehouse as WarehouseIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { RowMenu, type RowMenuItem } from "@/components/ui/row-menu";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/selection-controls";
import { EmptyState, ErrorState, ForbiddenState, NoResultsState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { describeError } from "@/features/setup/form-error";
import {
  OPTIONAL_ZONES,
  missingOptionalZones,
  useActivateWarehouse,
  useAddZone,
  useBranchList,
  useCreateWarehouse,
  useDeactivateWarehouse,
  useRenameZone,
  useUpdateWarehouse,
  useWarehouses,
  type Warehouse,
  type Zone,
  type ZoneType,
} from "./api";
import { DeactivateDialog } from "./deactivate-dialog";

const ZONE_ICONS: Partial<Record<ZoneType, typeof Snowflake>> = { COLD: Snowflake, SAFE: Vault };

function ZoneBadge({ zone }: { zone: Zone }) {
  const t = useTranslations("organization");
  return (
    <span title={zone.sellable ? t("sellableOpen") : t("sellableClosed")}>
      <Badge tone={zone.sellable ? "success" : "neutral"} icon={zone.sellable ? ShoppingCart : Lock}>
        {zone.name}
      </Badge>
    </span>
  );
}

export function WarehousesPage() {
  const t = useTranslations("organization");
  const me = useMe();
  const warehouses = useWarehouses();
  const branches = useBranchList();
  const activate = useActivateWarehouse();
  const deactivate = useDeactivateWarehouse();
  const addZone = useAddZone();
  const [query, setQuery] = useState("");
  const [branchFilter, setBranchFilter] = useState<string | null>(null);
  const [editing, setEditing] = useState<Warehouse | "new" | null>(null);
  const [deactivating, setDeactivating] = useState<Warehouse | null>(null);

  if (me.data && !can(me.data, "warehouses.view")) return <ForbiddenState description={t("warehouses.forbidden")} />;

  const branchName = (id: number) => branches.data?.find((b) => b.id === id)?.name ?? "";
  const q = query.trim().toLocaleLowerCase("uz");
  const rows = (warehouses.data ?? []).filter(
    (w) =>
      (!branchFilter || String(w.branchId) === branchFilter) &&
      (!q || [w.name, w.address ?? "", branchName(w.branchId)].some((v) => v.toLocaleLowerCase("uz").includes(q))),
  );
  const multiBranch = (branches.data?.length ?? 0) > 1;

  const columns: TableColumn<Warehouse>[] = [
    ...(multiBranch ? [{ key: "branch", title: t("branch"), render: (w: Warehouse) => branchName(w.branchId) }] : []),
    {
      key: "name",
      title: t("warehouses.warehouse"),
      render: (w) => (
        <span className="flex flex-col">
          <span>{w.name}</span>
          {w.address ? <span className="text-caption text-text-secondary">{w.address}</span> : null}
        </span>
      ),
    },
    {
      key: "zones",
      title: t("warehouses.zones"),
      render: (w) => (
        <span className="flex flex-wrap gap-1">
          {w.zones.map((z) => (
            <ZoneBadge key={z.id} zone={z} />
          ))}
        </span>
      ),
    },
    {
      key: "active",
      title: t("status"),
      render: (w) =>
        w.active ? (
          <Badge tone="success" icon={CircleCheck}>
            {t("active")}
          </Badge>
        ) : (
          <Badge tone="neutral" icon={CirclePause}>
            {t("inactive")}
          </Badge>
        ),
    },
  ];

  function menu(w: Warehouse): RowMenuItem[] {
    const items: RowMenuItem[] = [
      { key: "edit", label: t("edit"), icon: <Pencil size={16} strokeWidth={1.5} aria-hidden />, onSelect: () => setEditing(w) },
    ];
    for (const type of missingOptionalZones(w)) {
      const ZoneIcon = ZONE_ICONS[type] ?? Plus;
      items.push({
        key: `zone-${type}`,
        label: t("warehouses.addZone", { zone: t(`zone.${type}`) }),
        icon: <ZoneIcon size={16} strokeWidth={1.5} aria-hidden />,
        onSelect: () =>
          addZone.mutate(
            { id: w.id, type },
            {
              onSuccess: () =>
                toast({ tone: "success", title: t("warehouses.zoneAdded", { zone: t(`zone.${type}`) }), description: w.name }),
              onError: (e) => toast({ tone: "danger", title: t("warehouses.zoneAddFailed"), description: describeError(e).message ?? "" }),
            },
          ),
      });
    }
    items.push(
      w.active
        ? {
            key: "deactivate",
            label: t("deactivate"),
            icon: <PowerOff size={16} strokeWidth={1.5} aria-hidden />,
            onSelect: () => (deactivate.reset(), setDeactivating(w)),
          }
        : {
            key: "activate",
            label: t("activate"),
            icon: <Power size={16} strokeWidth={1.5} aria-hidden />,
            onSelect: () =>
              activate.mutate(w.id, {
                onSuccess: () => toast({ tone: "success", title: t("warehouses.activated"), description: w.name }),
                onError: (e) =>
                  toast({ tone: "danger", title: t("warehouses.activateFailed"), description: describeError(e).message ?? "" }),
              }),
          },
    );
    return items;
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-page-title">{t("warehouses.title")}</h1>
        <Button icon={Plus} onClick={() => setEditing("new")}>
          {t("warehouses.add")}
        </Button>
      </div>
      {warehouses.error ? (
        <ErrorState onRetry={() => warehouses.refetch()} />
      ) : (
        <Table
          caption={t("warehouses.caption")}
          columns={columns}
          rows={rows}
          rowKey={(w) => String(w.id)}
          loading={warehouses.isPending}
          onRowClick={(w) => setEditing(w)}
          toolbar={
            <div className="flex items-center gap-3">
              <div className="w-72">
                <TextField
                  label={t("search")}
                  variant="search"
                  size="sm"
                  value={query}
                  onChange={setQuery}
                  placeholder={t("warehouses.searchPlaceholder")}
                  className="[&>label]:sr-only"
                />
              </div>
              {multiBranch ? (
                <div className="w-56">
                  <Select
                    label={t("branch")}
                    size="sm"
                    value={branchFilter}
                    onChange={setBranchFilter}
                    placeholder={t("allBranches")}
                    className="[&>span:first-child]:sr-only"
                    options={(branches.data ?? []).map((b) => ({ value: String(b.id), label: b.name, sub: b.code }))}
                  />
                </div>
              ) : null}
            </div>
          }
          rowActions={(w) => <RowMenu items={menu(w)} />}
          emptyState={
            query || branchFilter ? (
              <NoResultsState onClearFilters={() => (setQuery(""), setBranchFilter(null))} />
            ) : (
              <EmptyState icon={WarehouseIcon} title={t("warehouses.emptyTitle")} description={t("warehouses.emptyDescription")} />
            )
          }
        />
      )}
      {editing === "new" ? <CreateWarehouseDrawer onClose={() => setEditing(null)} /> : null}
      {editing && editing !== "new" ? (
        <EditWarehouseDrawer
          warehouse={warehouses.data?.find((w) => w.id === editing.id) ?? editing}
          branchName={branchName(editing.branchId)}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {deactivating ? (
        <DeactivateDialog
          title={t("warehouses.deactivateTitle", { name: deactivating.name })}
          consequence={t("warehouses.deactivateConsequence")}
          actionLabel={t("warehouses.deactivateAction")}
          pending={deactivate.isPending}
          error={deactivate.error}
          onClose={() => setDeactivating(null)}
          onConfirm={(reason) =>
            deactivate.mutate(
              { id: deactivating.id, reason },
              {
                onSuccess: () => (
                  toast({ tone: "success", title: t("warehouses.deactivated"), description: deactivating.name }),
                  setDeactivating(null)
                ),
              },
            )
          }
        />
      ) : null}
    </>
  );
}

function CreateWarehouseDrawer({ onClose }: { onClose: () => void }) {
  const t = useTranslations("organization");
  const me = useMe();
  const branches = useBranchList();
  const create = useCreateWarehouse();
  const activeBranches = (branches.data ?? []).filter((b) => b.active);
  const [branchId, setBranchId] = useState<string | null>(me.data?.branchId ? String(me.data.branchId) : null);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [extra, setExtra] = useState<ZoneType[]>([]);
  const [branchError, setBranchError] = useState<string>();
  const err = describeError(create.error);
  const effectiveBranch = branchId ?? (activeBranches.length === 1 ? String(activeBranches[0].id) : null);

  function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!effectiveBranch) return setBranchError(t("warehouses.branchRequired"));
    create.mutate(
      { branchId: Number(effectiveBranch), name, address: address || undefined, extraZones: extra },
      {
        onSuccess: (w) => (
          toast({
            tone: "success",
            title: t("warehouses.added"),
            description: t("warehouses.addedDescription", { name: w.name, count: w.zones.length }),
          }),
          onClose()
        ),
      },
    );
  }

  return (
    <Drawer
      open
      onClose={onClose}
      size="lg"
      kind={t("warehouses.warehouse")}
      title={t("warehouses.new")}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("back")}
          </Button>
          <Button loading={create.isPending} onClick={() => submit()}>
            {t("warehouses.save")}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="grid grid-cols-2 gap-4">
        <Select
          label={t("branch")}
          required
          value={effectiveBranch}
          onChange={(v) => (setBranchId(v), setBranchError(undefined))}
          error={branchError ?? err.fields.branchId}
          options={activeBranches.map((b) => ({ value: String(b.id), label: b.name, sub: b.code }))}
          className="col-span-2"
        />
        <TextField label={t("name")} value={name} onChange={setName} error={err.fields.name} required />
        <TextField label={t("address")} value={address} onChange={setAddress} error={err.fields.address} />
        <fieldset className="col-span-2 flex flex-col gap-3">
          <legend className="mb-2 text-label">{t("warehouses.extraZones")}</legend>
          <p className="text-text-secondary">{t("warehouses.alwaysCreated")}</p>
          {OPTIONAL_ZONES.map((z) => (
            <Checkbox
              key={z}
              label={t(`zone.${z}`)}
              description={z === "COLD" ? t("warehouses.coldDescription") : t("warehouses.safeDescription")}
              checked={extra.includes(z)}
              onChange={(c) => setExtra((x) => (c ? [...x, z] : x.filter((y) => y !== z)))}
            />
          ))}
        </fieldset>
        {err.message ? <Alert tone="danger" title={err.message} className="col-span-2" /> : null}
      </form>
    </Drawer>
  );
}

function EditWarehouseDrawer({ warehouse, branchName, onClose }: { warehouse: Warehouse; branchName: string; onClose: () => void }) {
  const t = useTranslations("organization");
  const update = useUpdateWarehouse();
  const [name, setName] = useState(warehouse.name);
  const [address, setAddress] = useState(warehouse.address ?? "");
  const err = describeError(update.error);

  function submit(e?: FormEvent) {
    e?.preventDefault();
    update.mutate(
      { id: warehouse.id, name, address: address || undefined },
      { onSuccess: (w) => (toast({ tone: "success", title: t("warehouses.saved"), description: w.name }), onClose()) },
    );
  }

  return (
    <Drawer
      open
      onClose={onClose}
      size="lg"
      kind={branchName ? t("warehouses.warehouseWithBranch", { branch: branchName }) : t("warehouses.warehouse")}
      title={warehouse.name}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("back")}
          </Button>
          <Button loading={update.isPending} onClick={() => submit()}>
            {t("warehouses.save")}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="grid grid-cols-2 gap-4">
        <TextField label={t("name")} value={name} onChange={setName} error={err.fields.name} required />
        <TextField label={t("address")} value={address} onChange={setAddress} error={err.fields.address} />
        {err.message ? <Alert tone="danger" title={err.message} className="col-span-2" /> : null}
      </form>
      <h3 className="mt-6 mb-3 text-subtitle">{t("warehouses.zones")}</h3>
      <ul className="flex flex-col gap-3">
        {warehouse.zones.map((z) => (
          <ZoneRow key={z.id} warehouseId={warehouse.id} zone={z} />
        ))}
      </ul>
    </Drawer>
  );
}

function ZoneRow({ warehouseId, zone }: { warehouseId: number; zone: Zone }) {
  const t = useTranslations("organization");
  const rename = useRenameZone();
  const [name, setName] = useState(zone.name);
  const err = describeError(rename.error);
  const changed = name.trim() !== zone.name;
  return (
    <li className="flex items-start gap-3">
      <div className="flex-1">
        <TextField
          label={t(zone.sellable ? "zoneLabel" : "zoneLabelClosed", { zone: t(`zone.${zone.type}`) })}
          size="sm"
          value={name}
          onChange={setName}
          error={err.fields.name ?? err.message ?? undefined}
        />
      </div>
      {changed ? (
        <Button
          variant="secondary"
          size="sm"
          className="mt-6"
          loading={rename.isPending}
          onClick={() =>
            rename.mutate(
              { id: warehouseId, zoneId: zone.id, name: name.trim() },
              { onSuccess: () => toast({ tone: "success", title: t("warehouses.zoneRenamed"), description: name.trim() }) },
            )
          }
        >
          {t("warehouses.saveName")}
        </Button>
      ) : null}
    </li>
  );
}
