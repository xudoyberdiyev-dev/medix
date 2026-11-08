"use client";

import { Building2, Lock, Plus, ShoppingCart, UserPlus, Warehouse as WarehouseIcon } from "lucide-react";
import { useTranslations } from "next-intl";
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
  type Branch,
  type Employee,
  type Role,
  type SetupStatus,
  type Warehouse,
} from "./api";
import { describeError } from "./form-error";

function FormGrid({ children, onSubmit }: { children: ReactNode; onSubmit: (e: FormEvent<HTMLFormElement>) => void }) {
  return (
    <form onSubmit={onSubmit} noValidate className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {children}
    </form>
  );
}

/* ---------- 2. Filiallar ---------- */

const emptyBranch = { code: "", name: "", legalName: "", tin: "", address: "", phone: "" };

export function BranchesStep({ status }: { status: SetupStatus }) {
  const t = useTranslations("setup.branches");
  const create = useCreateBranch();
  const [form, setForm] = useState(emptyBranch);
  const err = describeError(create.error);
  const set = (k: keyof typeof emptyBranch) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    create.mutate(form, {
      onSuccess: (b) => {
        toast({ tone: "success", title: t("added"), description: `${b.name} (${b.code})` });
        setForm(emptyBranch);
        create.reset();
      },
    });
  }

  const columns: TableColumn<Branch>[] = [
    { key: "code", title: t("code"), mono: true, width: 80 },
    { key: "name", title: t("branch") },
    { key: "legalName", title: t("legalName") },
    { key: "tin", title: t("tin"), mono: true },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Table
        caption={t("caption")}
        columns={columns}
        rows={status.branches}
        rowKey={(b) => String(b.id)}
        emptyState={<EmptyState icon={Building2} title={t("emptyTitle")} description={t("emptyDescription")} />}
      />
      <Card title={t("new")}>
        <FormGrid onSubmit={submit}>
          <TextField label={t("code")} value={form.code} onChange={set("code")} error={err.fields.code} hint={t("codeHint")} required />
          <TextField
            label={t("name")}
            value={form.name}
            onChange={set("name")}
            error={err.fields.name}
            placeholder={t("namePlaceholder")}
            required
          />
          <TextField
            label={t("legalName")}
            value={form.legalName}
            onChange={set("legalName")}
            error={err.fields.legalName}
            placeholder={t("legalNamePlaceholder")}
            required
          />
          <TextField
            label={t("tin")}
            value={form.tin}
            onChange={set("tin")}
            error={err.fields.tin}
            inputMode="numeric"
            placeholder={t("tinPlaceholder")}
            required
          />
          <TextField label={t("address")} value={form.address} onChange={set("address")} error={err.fields.address} />
          <TextField
            label={t("phone")}
            value={form.phone}
            onChange={set("phone")}
            error={err.fields.phone}
            placeholder="+998 71 000 00 00"
          />
          {err.message ? <Alert tone="danger" title={err.message} className="md:col-span-2" /> : null}
          <div className="md:col-span-2">
            <Button type="submit" variant="secondary" icon={Plus} loading={create.isPending}>
              {t("add")}
            </Button>
          </div>
        </FormGrid>
      </Card>
    </div>
  );
}

/* ---------- 3. Omborlar va zonalar ---------- */

export function WarehousesStep({ status }: { status: SetupStatus }) {
  const t = useTranslations("setup.warehouses");
  const to = useTranslations("organization");
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
          toast({ tone: "success", title: t("added"), description: t("addedDescription", { name: w.name, count: w.zones.length }) });
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
    { key: "branch", title: t("branch"), render: (w) => branchName(w.branchId) },
    { key: "name", title: t("warehouse") },
    {
      key: "zones",
      title: t("zones"),
      render: (w) => (
        <span className="flex flex-wrap gap-1">
          {w.zones.map((z) => (
            <span key={z.id} title={z.sellable ? to("sellableOpen") : to("sellableClosed")}>
              <Badge tone={z.sellable ? "success" : "neutral"} icon={z.sellable ? ShoppingCart : Lock}>
                {to(`zone.${z.type}`)}
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
        caption={t("caption")}
        columns={columns}
        rows={status.warehouses}
        rowKey={(w) => String(w.id)}
        emptyState={<EmptyState icon={WarehouseIcon} title={t("emptyTitle")} description={t("emptyDescription")} />}
      />
      <Card title={t("new")}>
        <FormGrid onSubmit={submit}>
          <Select
            label={t("branch")}
            required
            value={branchId}
            onChange={setBranchId}
            error={err.fields.branchId}
            options={status.branches.map((b) => ({ value: String(b.id), label: b.name, sub: b.code }))}
          />
          <TextField
            label={t("name")}
            value={name}
            onChange={setName}
            error={err.fields.name}
            placeholder={t("namePlaceholder")}
            required
          />
          <TextField label={t("address")} value={address} onChange={setAddress} error={err.fields.address} className="md:col-span-2" />
          <div className="flex flex-col gap-1 md:col-span-2">
            <p className="text-text-secondary">{t("alwaysCreated")}</p>
            <div className="flex gap-6">
              <Checkbox label={t("cold")} description={t("coldDescription")} checked={cold} onChange={setCold} />
              <Checkbox label={t("safe")} description={t("safeDescription")} checked={safe} onChange={setSafe} />
            </div>
          </div>
          {err.message ? <Alert tone="danger" title={err.message} className="md:col-span-2" /> : null}
          <div className="md:col-span-2">
            <Button type="submit" variant="secondary" icon={Plus} loading={create.isPending}>
              {t("add")}
            </Button>
          </div>
        </FormGrid>
      </Card>
    </div>
  );
}

/* ---------- 4. Rollar ---------- */

export function RolesStep() {
  const t = useTranslations("setup.roles");
  const roles = useRoles();
  const columns: TableColumn<Role>[] = [
    { key: "name", title: t("role") },
    { key: "code", title: t("code"), mono: true },
    {
      key: "system",
      title: t("type"),
      render: (r) => (r.system ? <Badge tone="info">{t("standard")}</Badge> : <Badge>{t("copy")}</Badge>),
    },
    { key: "employeeCount", title: t("employees"), align: "right" },
  ];
  return (
    <div className="flex flex-col gap-4">
      <Alert tone="info" title={t("readyTitle")}>
        {t("readyDescription")}
      </Alert>
      {roles.error ? (
        <Card flush>
          <ErrorState onRetry={() => roles.refetch()} />
        </Card>
      ) : (
        <Table
          caption={t("caption")}
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
  const t = useTranslations("setup.employees");
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
            title: t("added"),
            description: t("addedDescription", { name: emp.fullName, login: emp.login }),
          });
          setForm(emptyEmployee);
          setRoleCode(null);
          setBranchId(null);
          create.reset();
        },
      },
    );
  }

  const branchName = (id?: number) => (id ? (status.branches.find((b) => b.id === id)?.name ?? "") : t("allBranches"));
  const columns: TableColumn<Employee>[] = [
    { key: "fullName", title: t("employee") },
    { key: "login", title: t("login"), mono: true },
    { key: "roleName", title: t("role") },
    { key: "branch", title: t("branch"), render: (e) => branchName(e.branchId) },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Table
        caption={t("caption")}
        columns={columns}
        rows={status.employees}
        rowKey={(e) => String(e.id)}
        emptyState={<EmptyState icon={UserPlus} title={t("emptyTitle")} description={t("emptyDescription")} />}
      />
      <Card title={t("new")}>
        <FormGrid onSubmit={submit}>
          <TextField label={t("fullName")} value={form.fullName} onChange={set("fullName")} error={err.fields.fullName} required />
          <TextField
            label={t("login")}
            value={form.login}
            onChange={set("login")}
            error={err.fields.login}
            hint={t("loginHint")}
            required
          />
          <Select
            label={t("role")}
            required
            searchable
            value={roleCode}
            onChange={setRoleCode}
            error={err.fields.roleCode}
            options={(roles.data ?? []).map((r) => ({ value: r.code, label: r.name }))}
          />
          <Select
            label={t("branch")}
            value={branchId}
            onChange={setBranchId}
            placeholder={t("allBranches")}
            hint={t("branchHint")}
            options={status.branches.map((b) => ({ value: String(b.id), label: b.name, sub: b.code }))}
          />
          <TextField label={t("phone")} value={form.phone} onChange={set("phone")} error={err.fields.phone} />
          <TextField label={t("position")} value={form.position} onChange={set("position")} error={err.fields.position} />
          <TextField
            label={t("password")}
            variant="password"
            value={form.temporaryPassword}
            onChange={set("temporaryPassword")}
            error={err.fields.temporaryPassword}
            hint={t("passwordHint")}
            autoComplete="new-password"
            required
          />
          {err.message ? <Alert tone="danger" title={err.message} className="md:col-span-2" /> : null}
          <div className="md:col-span-2">
            <Button type="submit" variant="secondary" icon={UserPlus} loading={create.isPending}>
              {t("add")}
            </Button>
          </div>
        </FormGrid>
      </Card>
    </div>
  );
}
