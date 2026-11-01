"use client";

import { BookOpen, CircleCheck, CirclePause, Lock, Pencil, Plus, Power, PowerOff, Truck } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { RowMenu, type RowMenuItem } from "@/components/ui/row-menu";
import { Select } from "@/components/ui/select";
import { EmptyState, ErrorState, NoResultsState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { useMe } from "@/features/auth/session";
import { useBranchList } from "@/features/organization/api";
import { describeError } from "@/features/setup/form-error";
import { formatQuantity } from "@/lib/format";
import { matchesSearch } from "@/lib/search";
import {
  DICTIONARIES,
  DICTIONARY_EDITORS,
  EXPENSE_EDITORS,
  VEHICLE_EDITORS,
  parseCapacity,
  useDictionary,
  useExpenseItems,
  useSaveEntry,
  useSaveExpenseItem,
  useSaveVehicle,
  useToggleEntry,
  useToggleExpenseItem,
  useToggleVehicle,
  useVehicles,
  type DictionaryMeta,
  type Entry,
  type ExpenseItem,
  type Vehicle,
} from "./api";

const TABS = [
  ...DICTIONARIES.map((d) => ({ key: d.kind.toLowerCase(), label: d.title })),
  { key: "vehicles", label: "Mashinalar" },
  { key: "expense-items", label: "Xarajat moddalari" },
];

function ActiveBadge({ active }: { active: boolean }) {
  return active ? (
    <Badge tone="success" icon={CircleCheck}>
      Faol
    </Badge>
  ) : (
    <Badge tone="neutral" icon={CirclePause}>
      Nofaol
    </Badge>
  );
}

const toggleItem = (active: boolean, onSelect: () => void): RowMenuItem =>
  active
    ? { key: "deactivate", label: "Nofaol qilish", icon: <PowerOff size={16} strokeWidth={1.5} aria-hidden />, onSelect }
    : { key: "activate", label: "Faollashtirish", icon: <Power size={16} strokeWidth={1.5} aria-hidden />, onSelect };

const editItem = (onSelect: () => void): RowMenuItem => ({
  key: "edit",
  label: "Tahrirlash",
  icon: <Pencil size={16} strokeWidth={1.5} aria-hidden />,
  onSelect,
});

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="w-80">
      <TextField
        label="Qidirish"
        variant="search"
        size="sm"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="[&>label]:sr-only"
      />
    </div>
  );
}

export function DictionariesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = TABS.some((t) => t.key === params.get("tab")) ? (params.get("tab") as string) : TABS[0].key;
  const [creating, setCreating] = useState(false);
  const me = useMe();
  const role = me.data?.role.code ?? "";
  const dict = DICTIONARIES.find((d) => d.kind.toLowerCase() === tab);
  const canEdit =
    tab === "vehicles"
      ? VEHICLE_EDITORS.includes(role)
      : tab === "expense-items"
        ? EXPENSE_EDITORS.includes(role)
        : DICTIONARY_EDITORS.includes(role);
  const addLabel = dict ? `${dict.singular} qoʻshish` : tab === "vehicles" ? "Mashina qoʻshish" : "Modda qoʻshish";

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-page-title">Maʼlumotnomalar</h1>
        {canEdit ? (
          <Button icon={Plus} onClick={() => setCreating(true)}>
            {addLabel}
          </Button>
        ) : null}
      </div>
      <div className="mb-4">
        <Tabs
          aria-label="Maʼlumotnomalar"
          items={TABS}
          value={tab}
          onChange={(key) => (setCreating(false), router.replace(`${pathname}?tab=${key}`, { scroll: false }))}
        />
      </div>
      {dict ? (
        <DictionaryTab key={dict.kind} meta={dict} canEdit={canEdit} creating={creating} onCreated={() => setCreating(false)} />
      ) : null}
      {tab === "vehicles" ? <VehiclesTab canEdit={canEdit} creating={creating} onCreated={() => setCreating(false)} /> : null}
      {tab === "expense-items" ? <ExpenseTab canEdit={canEdit} creating={creating} onCreated={() => setCreating(false)} /> : null}
    </>
  );
}

interface TabProps {
  canEdit: boolean;
  creating: boolean;
  onCreated: () => void;
}

function DictionaryTab({ meta, canEdit, creating, onCreated }: TabProps & { meta: DictionaryMeta }) {
  const list = useDictionary(meta.kind);
  const toggle = useToggleEntry(meta.kind);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Entry | null>(null);
  const rows = (list.data ?? []).filter((e) => matchesSearch(query, [e.name, e.shortName]));
  const columns: TableColumn<Entry>[] = [
    { key: "name", title: "Nomi" },
    ...(meta.shortName ? [{ key: "shortName", title: meta.shortName.label, mono: meta.shortName.mono }] : []),
    { key: "active", title: "Holat", render: (e: Entry) => <ActiveBadge active={e.active} /> },
  ];

  if (list.error) return <ErrorState onRetry={() => list.refetch()} />;
  return (
    <>
      <Table
        caption={meta.title}
        columns={columns}
        rows={rows}
        rowKey={(e) => String(e.id)}
        loading={list.isPending}
        onRowClick={canEdit ? setEditing : undefined}
        toolbar={<SearchBox value={query} onChange={setQuery} placeholder="Nomi boʻyicha (lotin yoki kirill)" />}
        rowActions={
          canEdit
            ? (e) => (
                <RowMenu
                  items={[
                    editItem(() => setEditing(e)),
                    toggleItem(!e.active, () =>
                      toggle.mutate(
                        { id: e.id, active: !e.active },
                        {
                          onSuccess: () =>
                            toast({ tone: "success", title: e.active ? "Nofaol qilindi" : "Faollashtirildi", description: e.name }),
                        },
                      ),
                    ),
                  ]}
                />
              )
            : undefined
        }
        emptyState={
          query ? (
            <NoResultsState onClearFilters={() => setQuery("")} />
          ) : (
            <EmptyState icon={BookOpen} title="Hali yozuv yoʻq" description={meta.empty} />
          )
        }
      />
      {creating || editing ? <EntryDialog meta={meta} entry={editing} onClose={() => (setEditing(null), onCreated())} /> : null}
    </>
  );
}

function EntryDialog({ meta, entry, onClose }: { meta: DictionaryMeta; entry: Entry | null; onClose: () => void }) {
  const save = useSaveEntry(meta.kind);
  const [name, setName] = useState(entry?.name ?? "");
  const [shortName, setShortName] = useState(entry?.shortName ?? "");
  const err = describeError(save.error);
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={entry ? `${meta.singular}: tahrirlash` : `Yangi: ${meta.singular.toLocaleLowerCase("uz")}`}
      primaryAction={{
        label: "Saqlash",
        loading: save.isPending,
        onClick: () =>
          save.mutate(
            { id: entry?.id, name, shortName },
            { onSuccess: (e) => (toast({ tone: "success", title: entry ? "Saqlandi" : "Qoʻshildi", description: e.name }), onClose()) },
          ),
      }}
    >
      <div className="flex flex-col gap-4">
        <TextField label="Nomi" value={name} onChange={setName} error={err.fields.name} required autoFocus />
        {meta.shortName ? (
          <TextField
            label={meta.shortName.label}
            value={shortName}
            onChange={setShortName}
            error={err.fields.shortName}
            hint={meta.shortName.hint}
            maxLength={50}
          />
        ) : null}
        {err.message ? <Alert tone="danger" title={err.message} /> : null}
      </div>
    </Modal>
  );
}

function VehiclesTab({ canEdit, creating, onCreated }: TabProps) {
  const list = useVehicles();
  const branches = useBranchList();
  const toggle = useToggleVehicle();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const branchName = (id: number) => branches.data?.find((b) => b.id === id)?.name ?? "";
  const multiBranch = new Set((list.data ?? []).map((v) => v.branchId)).size > 1;
  const rows = (list.data ?? []).filter((v) => matchesSearch(query, [v.plateNumber, v.model, branchName(v.branchId)]));
  const columns: TableColumn<Vehicle>[] = [
    { key: "plateNumber", title: "Davlat raqami", mono: true },
    { key: "model", title: "Model" },
    {
      key: "capacityBoxes",
      title: "Sigʻimi",
      align: "right",
      render: (v) => (v.capacityBoxes ? `${formatQuantity(v.capacityBoxes)} joy` : "—"),
    },
    ...(multiBranch ? [{ key: "branch", title: "Filial", render: (v: Vehicle) => branchName(v.branchId) }] : []),
    { key: "active", title: "Holat", render: (v: Vehicle) => <ActiveBadge active={v.active} /> },
  ];

  if (list.error) return <ErrorState onRetry={() => list.refetch()} />;
  return (
    <>
      <Table
        caption="Mashinalar"
        columns={columns}
        rows={rows}
        rowKey={(v) => String(v.id)}
        loading={list.isPending}
        onRowClick={canEdit ? setEditing : undefined}
        toolbar={<SearchBox value={query} onChange={setQuery} placeholder="Raqam yoki model" />}
        rowActions={
          canEdit
            ? (v) => (
                <RowMenu
                  items={[
                    editItem(() => setEditing(v)),
                    toggleItem(!v.active, () =>
                      toggle.mutate(
                        { id: v.id, active: !v.active },
                        {
                          onSuccess: () =>
                            toast({
                              tone: "success",
                              title: v.active ? "Mashina nofaol qilindi" : "Mashina faollashtirildi",
                              description: v.plateNumber,
                            }),
                        },
                      ),
                    ),
                  ]}
                />
              )
            : undefined
        }
        emptyState={
          query ? (
            <NoResultsState onClearFilters={() => setQuery("")} />
          ) : (
            <EmptyState icon={Truck} title="Hali mashina qoʻshilmagan" description="Reys tuzishda mashina va uning sigʻimi tanlanadi." />
          )
        }
      />
      {creating || editing ? <VehicleDialog vehicle={editing} onClose={() => (setEditing(null), onCreated())} /> : null}
    </>
  );
}

function VehicleDialog({ vehicle, onClose }: { vehicle: Vehicle | null; onClose: () => void }) {
  const me = useMe();
  const branches = useBranchList();
  const save = useSaveVehicle();
  const active = (branches.data ?? []).filter((b) => b.active);
  const [branchId, setBranchId] = useState<string | null>(
    vehicle ? String(vehicle.branchId) : me.data?.branchId ? String(me.data.branchId) : active.length === 1 ? String(active[0].id) : null,
  );
  const [plate, setPlate] = useState(vehicle?.plateNumber ?? "");
  const [model, setModel] = useState(vehicle?.model ?? "");
  const [capacity, setCapacity] = useState(vehicle?.capacityBoxes ? String(vehicle.capacityBoxes) : "");
  const [local, setLocal] = useState<{ branchId?: string; capacity?: string }>({});
  const err = describeError(save.error);

  function submit() {
    const cap = parseCapacity(capacity);
    const errors = {
      branchId: branchId ? undefined : "Filial tanlanmagan. Mashina qaysi filialga tegishli ekanini tanlang.",
      capacity: cap === null ? "Sigʻim — butun musbat son (joylar soni). Boʻsh qoldirish mumkin." : undefined,
    };
    setLocal(errors);
    if (errors.branchId || errors.capacity || !branchId || cap === null) return;
    save.mutate(
      { id: vehicle?.id, branchId: Number(branchId), plateNumber: plate, model, capacityBoxes: cap },
      {
        onSuccess: (v) => (
          toast({ tone: "success", title: vehicle ? "Mashina saqlandi" : "Mashina qoʻshildi", description: v.plateNumber }),
          onClose()
        ),
      },
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={vehicle ? `Mashina ${vehicle.plateNumber}` : "Yangi mashina"}
      primaryAction={{ label: "Mashinani saqlash", loading: save.isPending, onClick: submit }}
    >
      <div className="grid grid-cols-2 gap-4">
        <Select
          label="Filial"
          required
          value={branchId}
          onChange={setBranchId}
          error={local.branchId ?? err.fields.branchId}
          options={active.map((b) => ({ value: String(b.id), label: b.name, sub: b.code }))}
          className="col-span-2"
        />
        <TextField
          label="Davlat raqami"
          value={plate}
          onChange={(v) => setPlate(v.toUpperCase())}
          error={err.fields.plateNumber}
          hint="Masalan: 01 A 123 BC"
          required
          autoFocus
        />
        <TextField label="Model" value={model} onChange={setModel} error={err.fields.model} placeholder="Damas" required />
        <TextField
          label="Sigʻimi (joy)"
          value={capacity}
          onChange={setCapacity}
          error={local.capacity ?? err.fields.capacityBoxes}
          hint="Nechta quti sigʻadi — reysda tekshiriladi"
          inputMode="numeric"
        />
        {err.message ? <Alert tone="danger" title={err.message} className="col-span-2" /> : null}
      </div>
    </Modal>
  );
}

function ExpenseTab({ canEdit, creating, onCreated }: TabProps) {
  const list = useExpenseItems();
  const toggle = useToggleExpenseItem();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<ExpenseItem | null>(null);
  const rows = (list.data ?? []).filter((e) => matchesSearch(query, [e.name]));
  const columns: TableColumn<ExpenseItem>[] = [
    {
      key: "name",
      title: "Modda",
      render: (e) => (
        <span className="flex items-center gap-2">
          {e.name}
          {e.system ? (
            <span title="Standart modda — oʻzgartirilmaydi">
              <Badge tone="neutral" icon={Lock}>
                Standart
              </Badge>
            </span>
          ) : null}
        </span>
      ),
    },
    { key: "direction", title: "Turi", render: (e) => (e.direction === "EXPENSE" ? "Chiqim" : "Kirim") },
    { key: "active", title: "Holat", render: (e) => <ActiveBadge active={e.active} /> },
  ];

  if (list.error) return <ErrorState onRetry={() => list.refetch()} />;
  return (
    <>
      <Table
        caption="Xarajat va kirim moddalari"
        columns={columns}
        rows={rows}
        rowKey={(e) => String(e.id)}
        loading={list.isPending}
        onRowClick={canEdit ? (e) => !e.system && setEditing(e) : undefined}
        toolbar={<SearchBox value={query} onChange={setQuery} placeholder="Modda nomi" />}
        rowActions={
          canEdit
            ? (e) =>
                e.system ? null : (
                  <RowMenu
                    items={[
                      editItem(() => setEditing(e)),
                      toggleItem(!e.active, () =>
                        toggle.mutate(
                          { id: e.id, active: !e.active },
                          {
                            onSuccess: () =>
                              toast({ tone: "success", title: e.active ? "Nofaol qilindi" : "Faollashtirildi", description: e.name }),
                          },
                        ),
                      ),
                    ]}
                  />
                )
            : undefined
        }
        emptyState={
          query ? (
            <NoResultsState onClearFilters={() => setQuery("")} />
          ) : (
            <EmptyState icon={BookOpen} title="Moddalar yoʻq" description="Kassa va bank operatsiyalari moddalari shu yerda." />
          )
        }
      />
      {creating || editing ? <ExpenseDialog item={editing} onClose={() => (setEditing(null), onCreated())} /> : null}
    </>
  );
}

function ExpenseDialog({ item, onClose }: { item: ExpenseItem | null; onClose: () => void }) {
  const save = useSaveExpenseItem();
  const [name, setName] = useState(item?.name ?? "");
  const [direction, setDirection] = useState<string | null>(item?.direction ?? "EXPENSE");
  const err = describeError(save.error);
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={item ? "Moddani tahrirlash" : "Yangi modda"}
      primaryAction={{
        label: "Moddani saqlash",
        loading: save.isPending,
        onClick: () =>
          save.mutate(
            { id: item?.id, name, direction: direction === "INCOME" ? "INCOME" : "EXPENSE" },
            {
              onSuccess: (e) => (
                toast({ tone: "success", title: item ? "Modda saqlandi" : "Modda qoʻshildi", description: e.name }),
                onClose()
              ),
            },
          ),
      }}
    >
      <div className="flex flex-col gap-4">
        <Select
          label="Turi"
          required
          disabled={Boolean(item)}
          value={direction}
          onChange={setDirection}
          options={[
            { value: "EXPENSE", label: "Chiqim" },
            { value: "INCOME", label: "Kirim" },
          ]}
        />
        <TextField label="Nomi" value={name} onChange={setName} error={err.fields.name} required autoFocus />
        {err.message ? <Alert tone="danger" title={err.message} /> : null}
      </div>
    </Modal>
  );
}
