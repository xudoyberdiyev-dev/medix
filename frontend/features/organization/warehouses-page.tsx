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
import { useMe } from "@/features/auth/session";
import { describeError } from "@/features/setup/form-error";
import {
  OPTIONAL_ZONES,
  ZONE_LABELS,
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

/** Omborlarni Direktor, Bosh administrator va Filial rahbari (oʻz filiali) boshqaradi. */
const MANAGERS = ["DIRECTOR", "ADMIN", "BRANCH_MANAGER"];

const ZONE_ICONS: Partial<Record<ZoneType, typeof Snowflake>> = { COLD: Snowflake, SAFE: Vault };

function ZoneBadge({ zone }: { zone: Zone }) {
  return (
    <span title={zone.sellable ? "Sotuvga ochiq" : "Sotuvga yopiq"}>
      <Badge tone={zone.sellable ? "success" : "neutral"} icon={zone.sellable ? ShoppingCart : Lock}>
        {zone.name}
      </Badge>
    </span>
  );
}

export function WarehousesPage() {
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

  if (me.data && !MANAGERS.includes(me.data.role.code))
    return <ForbiddenState description="Omborlarni Direktor, Bosh administrator va Filial rahbari boshqaradi." />;

  const branchName = (id: number) => branches.data?.find((b) => b.id === id)?.name ?? "";
  const q = query.trim().toLocaleLowerCase("uz");
  const rows = (warehouses.data ?? []).filter(
    (w) =>
      (!branchFilter || String(w.branchId) === branchFilter) &&
      (!q || [w.name, w.address ?? "", branchName(w.branchId)].some((v) => v.toLocaleLowerCase("uz").includes(q))),
  );
  const multiBranch = (branches.data?.length ?? 0) > 1;

  const columns: TableColumn<Warehouse>[] = [
    ...(multiBranch ? [{ key: "branch", title: "Filial", render: (w: Warehouse) => branchName(w.branchId) }] : []),
    {
      key: "name",
      title: "Ombor",
      render: (w) => (
        <span className="flex flex-col">
          <span>{w.name}</span>
          {w.address ? <span className="text-caption text-text-secondary">{w.address}</span> : null}
        </span>
      ),
    },
    {
      key: "zones",
      title: "Zonalar",
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
      title: "Holat",
      render: (w) =>
        w.active ? (
          <Badge tone="success" icon={CircleCheck}>
            Faol
          </Badge>
        ) : (
          <Badge tone="neutral" icon={CirclePause}>
            Nofaol
          </Badge>
        ),
    },
  ];

  function menu(w: Warehouse): RowMenuItem[] {
    const items: RowMenuItem[] = [
      { key: "edit", label: "Tahrirlash", icon: <Pencil size={16} strokeWidth={1.5} aria-hidden />, onSelect: () => setEditing(w) },
    ];
    for (const type of missingOptionalZones(w)) {
      const ZoneIcon = ZONE_ICONS[type] ?? Plus;
      items.push({
        key: `zone-${type}`,
        label: `${ZONE_LABELS[type]} zonasini qoʻshish`,
        icon: <ZoneIcon size={16} strokeWidth={1.5} aria-hidden />,
        onSelect: () =>
          addZone.mutate(
            { id: w.id, type },
            {
              onSuccess: () => toast({ tone: "success", title: `${ZONE_LABELS[type]} zonasi qoʻshildi`, description: w.name }),
              onError: (e) => toast({ tone: "danger", title: "Zona qoʻshilmadi", description: describeError(e).message ?? "" }),
            },
          ),
      });
    }
    items.push(
      w.active
        ? {
            key: "deactivate",
            label: "Nofaol qilish",
            icon: <PowerOff size={16} strokeWidth={1.5} aria-hidden />,
            onSelect: () => (deactivate.reset(), setDeactivating(w)),
          }
        : {
            key: "activate",
            label: "Faollashtirish",
            icon: <Power size={16} strokeWidth={1.5} aria-hidden />,
            onSelect: () =>
              activate.mutate(w.id, {
                onSuccess: () => toast({ tone: "success", title: "Ombor faollashtirildi", description: w.name }),
                onError: (e) => toast({ tone: "danger", title: "Ombor faollashtirilmadi", description: describeError(e).message ?? "" }),
              }),
          },
    );
    return items;
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-page-title">Omborlar va zonalar</h1>
        <Button icon={Plus} onClick={() => setEditing("new")}>
          Ombor qoʻshish
        </Button>
      </div>
      {warehouses.error ? (
        <ErrorState onRetry={() => warehouses.refetch()} />
      ) : (
        <Table
          caption="Omborlar"
          columns={columns}
          rows={rows}
          rowKey={(w) => String(w.id)}
          loading={warehouses.isPending}
          onRowClick={(w) => setEditing(w)}
          toolbar={
            <div className="flex items-center gap-3">
              <div className="w-72">
                <TextField
                  label="Qidirish"
                  variant="search"
                  size="sm"
                  value={query}
                  onChange={setQuery}
                  placeholder="Ombor nomi yoki manzil"
                  className="[&>label]:sr-only"
                />
              </div>
              {multiBranch ? (
                <div className="w-56">
                  <Select
                    label="Filial"
                    size="sm"
                    value={branchFilter}
                    onChange={setBranchFilter}
                    placeholder="Barcha filiallar"
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
              <EmptyState
                icon={WarehouseIcon}
                title="Hali ombor qoʻshilmagan"
                description="Har omborda Qabul, Asosiy saqlash, Karantin va Joʻnatish zonalari avtomatik yaratiladi."
              />
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
          title={`«${deactivating.name}» omborini nofaol qilasizmi?`}
          consequence="Ombor roʻyxatlarda «Nofaol» boʻlib qoladi, unga yangi hujjat kiritilmaydi. Maʼlumotlari va tarixi saqlanadi — keyin faollashtirish mumkin."
          actionLabel="Omborni nofaol qilish"
          pending={deactivate.isPending}
          error={deactivate.error}
          onClose={() => setDeactivating(null)}
          onConfirm={(reason) =>
            deactivate.mutate(
              { id: deactivating.id, reason },
              {
                onSuccess: () => (
                  toast({ tone: "success", title: "Ombor nofaol qilindi", description: deactivating.name }),
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
    if (!effectiveBranch) return setBranchError("Filial tanlanmagan. Ombor qaysi filialga tegishli ekanini tanlang.");
    create.mutate(
      { branchId: Number(effectiveBranch), name, address: address || undefined, extraZones: extra },
      {
        onSuccess: (w) => (
          toast({ tone: "success", title: "Ombor qoʻshildi", description: `${w.name}: ${w.zones.length} ta zona` }),
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
      kind="Ombor"
      title="Yangi ombor"
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            Ortga
          </Button>
          <Button loading={create.isPending} onClick={() => submit()}>
            Omborni saqlash
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="grid grid-cols-2 gap-4">
        <Select
          label="Filial"
          required
          value={effectiveBranch}
          onChange={(v) => (setBranchId(v), setBranchError(undefined))}
          error={branchError ?? err.fields.branchId}
          options={activeBranches.map((b) => ({ value: String(b.id), label: b.name, sub: b.code }))}
          className="col-span-2"
        />
        <TextField label="Nomi" value={name} onChange={setName} error={err.fields.name} required />
        <TextField label="Manzil" value={address} onChange={setAddress} error={err.fields.address} />
        <fieldset className="col-span-2 flex flex-col gap-3">
          <legend className="mb-2 text-label">Qoʻshimcha zonalar</legend>
          <p className="text-text-secondary">Qabul, Asosiy saqlash, Karantin va Joʻnatish zonalari doim yaratiladi.</p>
          {OPTIONAL_ZONES.map((t) => (
            <Checkbox
              key={t}
              label={ZONE_LABELS[t]}
              description={t === "COLD" ? "Sovuq zanjir talab qiladigan dorilar uchun" : "Nazoratdagi dorilar uchun"}
              checked={extra.includes(t)}
              onChange={(c) => setExtra((x) => (c ? [...x, t] : x.filter((y) => y !== t)))}
            />
          ))}
        </fieldset>
        {err.message ? <Alert tone="danger" title={err.message} className="col-span-2" /> : null}
      </form>
    </Drawer>
  );
}

function EditWarehouseDrawer({ warehouse, branchName, onClose }: { warehouse: Warehouse; branchName: string; onClose: () => void }) {
  const update = useUpdateWarehouse();
  const [name, setName] = useState(warehouse.name);
  const [address, setAddress] = useState(warehouse.address ?? "");
  const err = describeError(update.error);

  function submit(e?: FormEvent) {
    e?.preventDefault();
    update.mutate(
      { id: warehouse.id, name, address: address || undefined },
      { onSuccess: (w) => (toast({ tone: "success", title: "Ombor saqlandi", description: w.name }), onClose()) },
    );
  }

  return (
    <Drawer
      open
      onClose={onClose}
      size="lg"
      kind={branchName ? `Ombor · ${branchName}` : "Ombor"}
      title={warehouse.name}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            Ortga
          </Button>
          <Button loading={update.isPending} onClick={() => submit()}>
            Omborni saqlash
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="grid grid-cols-2 gap-4">
        <TextField label="Nomi" value={name} onChange={setName} error={err.fields.name} required />
        <TextField label="Manzil" value={address} onChange={setAddress} error={err.fields.address} />
        {err.message ? <Alert tone="danger" title={err.message} className="col-span-2" /> : null}
      </form>
      <h3 className="mt-6 mb-3 text-subtitle">Zonalar</h3>
      <ul className="flex flex-col gap-3">
        {warehouse.zones.map((z) => (
          <ZoneRow key={z.id} warehouseId={warehouse.id} zone={z} />
        ))}
      </ul>
    </Drawer>
  );
}

function ZoneRow({ warehouseId, zone }: { warehouseId: number; zone: Zone }) {
  const rename = useRenameZone();
  const [name, setName] = useState(zone.name);
  const err = describeError(rename.error);
  const changed = name.trim() !== zone.name;
  return (
    <li className="flex items-start gap-3">
      <div className="flex-1">
        <TextField
          label={`${ZONE_LABELS[zone.type]} · ${zone.sellable ? "sotuvga ochiq" : "sotuvga yopiq"}`}
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
              { onSuccess: () => toast({ tone: "success", title: "Zona nomi saqlandi", description: name.trim() }) },
            )
          }
        >
          Nomni saqlash
        </Button>
      ) : null}
    </li>
  );
}
