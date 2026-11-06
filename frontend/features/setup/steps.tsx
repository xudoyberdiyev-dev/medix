"use client";

import { Building2, Lock, Plus, ShoppingCart, UserPlus, Warehouse as WarehouseIcon } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/selection-controls";
import { EmptyState, ErrorState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import {
  useCreateBranch,
  useCreateEmployee,
  useCreateWarehouse,
  useRoles,
  useSaveCompany,
  type Branch,
  type Employee,
  type Role,
  type SetupStatus,
  type Warehouse,
} from "./api";
import { ZONE_LABELS } from "@/features/organization/api";
import { describeError } from "./form-error";

function FormGrid({ children, onSubmit }: { children: ReactNode; onSubmit: (e: FormEvent<HTMLFormElement>) => void }) {
  return (
    <form onSubmit={onSubmit} noValidate className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {children}
    </form>
  );
}

/* ---------- 1. Kompaniya ---------- */

export function CompanyStep({ status, onDone }: { status: SetupStatus; onDone: () => void }) {
  const save = useSaveCompany();
  const [name, setName] = useState(status.company?.name ?? "");
  const [error, setError] = useState<string>();
  const err = describeError(save.error);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Kompaniya nomi kiritilmagan. Guruh nomini yozing, masalan «Medix Group».");
      return;
    }
    setError(undefined);
    save.mutate({ name: name.trim() }, { onSuccess: onDone });
  }

  return (
    <Card title="Kompaniya">
      <form onSubmit={submit} noValidate className="flex max-w-xl flex-col gap-4">
        <TextField
          label="Kompaniya (guruh) nomi"
          size="lg"
          value={name}
          onChange={setName}
          error={error ?? err.fields.name}
          required
          autoFocus
        />
        {err.message ? <Alert tone="danger" title={err.message} /> : null}
        <div>
          <Button type="submit" size="lg" loading={save.isPending}>
            Saqlash va davom etish
          </Button>
        </div>
      </form>
    </Card>
  );
}

/* ---------- 2. Filiallar ---------- */

const emptyBranch = { code: "", name: "", legalName: "", tin: "", address: "", phone: "" };

export function BranchesStep({ status }: { status: SetupStatus }) {
  const create = useCreateBranch();
  const [form, setForm] = useState(emptyBranch);
  const err = describeError(create.error);
  const set = (k: keyof typeof emptyBranch) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    create.mutate(form, {
      onSuccess: (b) => {
        toast({ tone: "success", title: "Filial qoʻshildi", description: `${b.name} (${b.code})` });
        setForm(emptyBranch);
        create.reset();
      },
    });
  }

  const columns: TableColumn<Branch>[] = [
    { key: "code", title: "Kod", mono: true, width: 80 },
    { key: "name", title: "Filial" },
    { key: "legalName", title: "Yuridik nomi" },
    { key: "tin", title: "STIR", mono: true },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Table
        caption="Filiallar"
        columns={columns}
        rows={status.branches}
        rowKey={(b) => String(b.id)}
        emptyState={
          <EmptyState
            icon={Building2}
            title="Hali filial qoʻshilmagan"
            description="Har filial alohida yuridik shaxs: kodi (TSH) hujjat raqamlarida ishlatiladi."
          />
        }
      />
      <Card title="Yangi filial">
        <FormGrid onSubmit={submit}>
          <TextField
            label="Kod"
            value={form.code}
            onChange={set("code")}
            error={err.fields.code}
            hint="3 ta lotin harfi: TSH, SMQ, BXR, FRG"
            required
          />
          <TextField label="Nomi" value={form.name} onChange={set("name")} error={err.fields.name} placeholder="Toshkent" required />
          <TextField
            label="Yuridik nomi"
            value={form.legalName}
            onChange={set("legalName")}
            error={err.fields.legalName}
            placeholder="«Medix Toshkent» MChJ"
            required
          />
          <TextField
            label="STIR"
            value={form.tin}
            onChange={set("tin")}
            error={err.fields.tin}
            inputMode="numeric"
            placeholder="9 ta raqam"
            required
          />
          <TextField label="Manzil" value={form.address} onChange={set("address")} error={err.fields.address} />
          <TextField label="Telefon" value={form.phone} onChange={set("phone")} error={err.fields.phone} placeholder="+998 71 000 00 00" />
          {err.message ? <Alert tone="danger" title={err.message} className="md:col-span-2" /> : null}
          <div className="md:col-span-2">
            <Button type="submit" variant="secondary" icon={Plus} loading={create.isPending}>
              Filial qoʻshish
            </Button>
          </div>
        </FormGrid>
      </Card>
    </div>
  );
}

/* ---------- 3. Omborlar va zonalar ---------- */

export function WarehousesStep({ status }: { status: SetupStatus }) {
  const create = useCreateWarehouse();
  const [branchId, setBranchId] = useState<string | null>(status.branches[0] ? String(status.branches[0].id) : null);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [cold, setCold] = useState(false);
  const [safe, setSafe] = useState(false);
  const err = describeError(create.error);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const extraZones: ("COLD" | "SAFE")[] = [];
    if (cold) extraZones.push("COLD");
    if (safe) extraZones.push("SAFE");
    create.mutate(
      { branchId: Number(branchId), name, address, extraZones },
      {
        onSuccess: (w) => {
          toast({ tone: "success", title: "Ombor qoʻshildi", description: `${w.name}: ${w.zones.length} ta zona` });
          setName("");
          setAddress("");
          setCold(false);
          setSafe(false);
          create.reset();
        },
      },
    );
  }

  const branchName = (id: number) => status.branches.find((b) => b.id === id)?.name ?? "";
  const columns: TableColumn<Warehouse>[] = [
    { key: "branch", title: "Filial", render: (w) => branchName(w.branchId) },
    { key: "name", title: "Ombor" },
    {
      key: "zones",
      title: "Zonalar",
      render: (w) => (
        <span className="flex flex-wrap gap-1">
          {w.zones.map((z) => (
            <span key={z.id} title={z.sellable ? "Sotuvga ochiq" : "Sotuvga yopiq"}>
              <Badge tone={z.sellable ? "success" : "neutral"} icon={z.sellable ? ShoppingCart : Lock}>
                {ZONE_LABELS[z.type] ?? z.name}
              </Badge>
            </span>
          ))}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Table
        caption="Omborlar"
        columns={columns}
        rows={status.warehouses}
        rowKey={(w) => String(w.id)}
        emptyState={
          <EmptyState
            icon={WarehouseIcon}
            title="Hali ombor qoʻshilmagan"
            description="Har filialga kamida bitta ombor kerak. Zonalar avtomatik yaratiladi."
          />
        }
      />
      <Card title="Yangi ombor">
        <FormGrid onSubmit={submit}>
          <Select
            label="Filial"
            required
            value={branchId}
            onChange={setBranchId}
            error={err.fields.branchId}
            options={status.branches.map((b) => ({ value: String(b.id), label: b.name, sub: b.code }))}
          />
          <TextField label="Ombor nomi" value={name} onChange={setName} error={err.fields.name} placeholder="Markaziy ombor" required />
          <TextField label="Manzil" value={address} onChange={setAddress} error={err.fields.address} className="md:col-span-2" />
          <div className="flex flex-col gap-1 md:col-span-2">
            <p className="text-text-secondary">Qabul, Asosiy saqlash, Karantin va Joʻnatish zonalari doim yaratiladi. Qoʻshimcha:</p>
            <div className="flex gap-6">
              <Checkbox label="Sovuq" description="Sovutgichda saqlanadigan dorilar" checked={cold} onChange={setCold} />
              <Checkbox label="Seyf" description="Nazoratdagi preparatlar" checked={safe} onChange={setSafe} />
            </div>
          </div>
          {err.message ? <Alert tone="danger" title={err.message} className="md:col-span-2" /> : null}
          <div className="md:col-span-2">
            <Button type="submit" variant="secondary" icon={Plus} loading={create.isPending}>
              Ombor qoʻshish
            </Button>
          </div>
        </FormGrid>
      </Card>
    </div>
  );
}

/* ---------- 4. Rollar ---------- */

export function RolesStep() {
  const roles = useRoles();
  const columns: TableColumn<Role>[] = [
    { key: "name", title: "Rol" },
    { key: "code", title: "Kod", mono: true },
    { key: "system", title: "Turi", render: (r) => (r.system ? <Badge tone="info">Standart</Badge> : <Badge>Nusxa</Badge>) },
    { key: "employeeCount", title: "Xodimlar", align: "right" },
  ];
  return (
    <div className="flex flex-col gap-4">
      <Alert tone="info" title="11 ta standart rol tayyor">
        Ruxsatlar matritsasini (har rol nimani koʻrishi va qilishi) keyinroq «Sozlamalar → Rollar» boʻlimida oʻzgartirish mumkin.
      </Alert>
      {roles.error ? (
        <Card flush>
          <ErrorState onRetry={() => roles.refetch()} />
        </Card>
      ) : (
        <Table
          caption="Rollar"
          columns={columns}
          rows={roles.data ?? []}
          rowKey={(r) => r.code}
          loading={roles.isPending}
          density="compact"
        />
      )}
    </div>
  );
}

/* ---------- 5. Xodimlar ---------- */

const emptyEmployee = { fullName: "", login: "", phone: "", position: "", temporaryPassword: "" };

export function EmployeesStep({ status }: { status: SetupStatus }) {
  const create = useCreateEmployee();
  const roles = useRoles();
  const [form, setForm] = useState(emptyEmployee);
  const [roleCode, setRoleCode] = useState<string | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);
  const err = describeError(create.error);
  const set = (k: keyof typeof emptyEmployee) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    create.mutate(
      { ...form, roleCode: roleCode ?? "", branchId: branchId ? Number(branchId) : undefined },
      {
        onSuccess: (emp) => {
          toast({
            tone: "success",
            title: "Xodim qoʻshildi",
            description: `${emp.fullName} — login: ${emp.login}. Vaqtinchalik parolni xodimga bering.`,
          });
          setForm(emptyEmployee);
          setRoleCode(null);
          setBranchId(null);
          create.reset();
        },
      },
    );
  }

  const branchName = (id?: number) => (id ? (status.branches.find((b) => b.id === id)?.name ?? "") : "Barcha filiallar");
  const columns: TableColumn<Employee>[] = [
    { key: "fullName", title: "Xodim" },
    { key: "login", title: "Login", mono: true },
    { key: "roleName", title: "Rol" },
    { key: "branch", title: "Filial", render: (e) => branchName(e.branchId) },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Table
        caption="Xodimlar"
        columns={columns}
        rows={status.employees}
        rowKey={(e) => String(e.id)}
        emptyState={
          <EmptyState
            icon={UserPlus}
            title="Xodimlar yoʻq"
            description="Loginlarni siz yaratasiz; xodim birinchi kirishda parolni almashtiradi."
          />
        }
      />
      <Card title="Yangi xodim">
        <FormGrid onSubmit={submit}>
          <TextField label="F.I.Sh." value={form.fullName} onChange={set("fullName")} error={err.fields.fullName} required />
          <TextField
            label="Login"
            value={form.login}
            onChange={set("login")}
            error={err.fields.login}
            hint="Lotin harflari, raqam, nuqta"
            required
          />
          <Select
            label="Rol"
            required
            searchable
            value={roleCode}
            onChange={setRoleCode}
            error={err.fields.roleCode}
            options={(roles.data ?? []).map((r) => ({ value: r.code, label: r.name }))}
          />
          <Select
            label="Filial"
            value={branchId}
            onChange={setBranchId}
            placeholder="Barcha filiallar"
            hint="Direktor, Bosh administrator va Buxgalter barcha filiallarni koʻradi"
            options={status.branches.map((b) => ({ value: String(b.id), label: b.name, sub: b.code }))}
          />
          <TextField label="Telefon" value={form.phone} onChange={set("phone")} error={err.fields.phone} />
          <TextField label="Lavozim" value={form.position} onChange={set("position")} error={err.fields.position} />
          <TextField
            label="Vaqtinchalik parol"
            variant="password"
            value={form.temporaryPassword}
            onChange={set("temporaryPassword")}
            error={err.fields.temporaryPassword}
            hint="Kamida 8 belgi. Xodim birinchi kirishda almashtiradi."
            autoComplete="new-password"
            required
          />
          {err.message ? <Alert tone="danger" title={err.message} className="md:col-span-2" /> : null}
          <div className="md:col-span-2">
            <Button type="submit" variant="secondary" icon={UserPlus} loading={create.isPending}>
              Xodim qoʻshish
            </Button>
          </div>
        </FormGrid>
      </Card>
    </div>
  );
}
