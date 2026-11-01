"use client";

import { Ban, CircleCheck, Ellipsis, KeyRound, LockOpen, UserPlus, Users } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { EmptyState, ErrorState, ForbiddenState, NoResultsState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { useRoles } from "@/features/setup/api";
import { describeError } from "@/features/setup/form-error";
import { ApiError } from "@/lib/api/client";
import {
  filterEmployees,
  useBranches,
  useBlockEmployee,
  useCreateEmployee,
  useEmployees,
  useResetPassword,
  useUnblockEmployee,
  type Employee,
} from "./api";

type Dialog = { kind: "block" | "reset"; employee: Employee } | null;

export function EmployeesPage() {
  const employees = useEmployees();
  const unblock = useUnblockEmployee();
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [menuFor, setMenuFor] = useState<number | null>(null);

  if (employees.error instanceof ApiError && employees.error.isForbidden)
    return <ForbiddenState description="Xodimlarni Direktor va Bosh administrator boshqaradi." />;

  const rows = filterEmployees(employees.data ?? [], query);
  const columns: TableColumn<Employee>[] = [
    {
      key: "fullName",
      title: "Xodim",
      render: (e) => (
        <span className="flex flex-col">
          <span>{e.fullName}</span>
          {e.position ? <span className="text-caption text-text-secondary">{e.position}</span> : null}
        </span>
      ),
    },
    { key: "login", title: "Login", mono: true },
    { key: "roleName", title: "Rol" },
    {
      key: "status",
      title: "Holat",
      render: (e) =>
        e.status === "BLOCKED" ? (
          <Badge tone="danger" icon={Ban}>
            Bloklangan
          </Badge>
        ) : e.mustChangePassword ? (
          <Badge tone="warning" icon={KeyRound}>
            Parol almashtirilmagan
          </Badge>
        ) : (
          <Badge tone="success" icon={CircleCheck}>
            Faol
          </Badge>
        ),
    },
  ];

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-page-title">Xodimlar</h1>
        <Button icon={UserPlus} onClick={() => setCreating(true)}>
          Xodim qoʻshish
        </Button>
      </div>
      {employees.error ? (
        <ErrorState onRetry={() => employees.refetch()} />
      ) : (
        <Table
          caption="Xodimlar"
          columns={columns}
          rows={rows}
          rowKey={(e) => String(e.id)}
          loading={employees.isPending}
          toolbar={
            <div className="w-80">
              <TextField
                label="Qidirish"
                variant="search"
                size="sm"
                value={query}
                onChange={setQuery}
                placeholder="Ism, login yoki rol"
                className="[&>label]:sr-only"
              />
            </div>
          }
          rowActions={(e) => (
            <span className="relative inline-flex">
              <Button
                variant="icon"
                size="sm"
                icon={Ellipsis}
                aria-label="Amallar"
                title="Amallar"
                onClick={() => setMenuFor(menuFor === e.id ? null : e.id)}
              />
              {menuFor === e.id ? (
                <span
                  role="menu"
                  className="absolute top-full right-0 z-30 mt-1 flex w-56 flex-col rounded-card border border-border bg-surface p-1 text-left shadow-overlay"
                >
                  {e.status === "BLOCKED" ? (
                    <MenuItem
                      icon={<LockOpen size={16} strokeWidth={1.5} aria-hidden />}
                      label="Blokdan chiqarish"
                      onClick={() => {
                        setMenuFor(null);
                        unblock.mutate(e.id, {
                          onSuccess: () => toast({ tone: "success", title: "Xodim blokdan chiqarildi", description: e.fullName }),
                        });
                      }}
                    />
                  ) : (
                    <MenuItem
                      icon={<Ban size={16} strokeWidth={1.5} aria-hidden />}
                      label="Bloklash"
                      onClick={() => (setMenuFor(null), setDialog({ kind: "block", employee: e }))}
                    />
                  )}
                  <MenuItem
                    icon={<KeyRound size={16} strokeWidth={1.5} aria-hidden />}
                    label="Vaqtinchalik parol berish"
                    onClick={() => (setMenuFor(null), setDialog({ kind: "reset", employee: e }))}
                  />
                </span>
              ) : null}
            </span>
          )}
          emptyState={
            query ? (
              <NoResultsState onClearFilters={() => setQuery("")} />
            ) : (
              <EmptyState
                icon={Users}
                title="Hali xodim qoʻshilmagan"
                description="Loginlarni siz yaratasiz; xodim birinchi kirishda parolni almashtiradi."
              />
            )
          }
        />
      )}
      <CreateEmployeeDrawer open={creating} onClose={() => setCreating(false)} />
      {dialog?.kind === "block" ? <BlockDialog employee={dialog.employee} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === "reset" ? <ResetDialog employee={dialog.employee} onClose={() => setDialog(null)} /> : null}
    </>
  );
}

function MenuItem({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex h-control-sm items-center gap-2 rounded-control px-2 text-body hover:bg-table-header"
    >
      {icon}
      {label}
    </button>
  );
}

function BlockDialog({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const block = useBlockEmployee();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const err = describeError(block.error);
  return (
    <Modal
      open
      onClose={onClose}
      tone="danger"
      size="sm"
      title={`${employee.fullName}ni bloklaysizmi?`}
      primaryAction={{
        label: "Xodimni bloklash",
        loading: block.isPending,
        onClick: () => {
          if (!reason.trim()) return setError("Sabab kiritilmagan. Nega bloklanayotganini yozing.");
          block.mutate(
            { id: employee.id, reason: reason.trim() },
            { onSuccess: () => (toast({ tone: "success", title: "Xodim bloklandi", description: employee.fullName }), onClose()) },
          );
        },
      }}
    >
      <p>Xodim tizimga kira olmaydi, ochiq sessiyalari darhol tugatiladi. Keyin blokdan chiqarish mumkin.</p>
      <div className="mt-4">
        <TextField label="Sabab" value={reason} onChange={setReason} error={error ?? err.fields.reason} required autoFocus />
      </div>
      {err.message ? <Alert tone="danger" title={err.message} className="mt-4" /> : null}
    </Modal>
  );
}

function ResetDialog({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const reset = useResetPassword();
  const [password, setPassword] = useState("");
  const err = describeError(reset.error);
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Vaqtinchalik parol berish"
      primaryAction={{
        label: "Parolni saqlash",
        loading: reset.isPending,
        onClick: () =>
          reset.mutate(
            { id: employee.id, temporaryPassword: password },
            {
              onSuccess: () => (
                toast({
                  tone: "success",
                  title: "Vaqtinchalik parol saqlandi",
                  description: `${employee.fullName} keyingi kirishda parolni almashtiradi.`,
                }),
                onClose()
              ),
            },
          ),
      }}
    >
      <p className="mb-4 text-text-secondary">
        {employee.fullName} ({employee.login}) ning ochiq sessiyalari tugatiladi.
      </p>
      <TextField
        label="Vaqtinchalik parol"
        variant="password"
        value={password}
        onChange={setPassword}
        error={err.fields.temporaryPassword}
        hint="Kamida 8 belgi"
        autoComplete="new-password"
        required
        autoFocus
      />
      {err.message ? <Alert tone="danger" title={err.message} className="mt-4" /> : null}
    </Modal>
  );
}

const emptyForm = { fullName: "", login: "", phone: "", position: "", temporaryPassword: "" };

function CreateEmployeeDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateEmployee();
  const roles = useRoles();
  const branches = useBranches();
  const [form, setForm] = useState(emptyForm);
  const [roleCode, setRoleCode] = useState<string | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);
  const err = describeError(create.error);
  const set = (k: keyof typeof emptyForm) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  function close() {
    setForm(emptyForm);
    setRoleCode(null);
    setBranchId(null);
    create.reset();
    onClose();
  }

  function submit(e?: FormEvent) {
    e?.preventDefault();
    create.mutate(
      { ...form, roleCode: roleCode ?? "", branchId: branchId ? Number(branchId) : undefined },
      {
        onSuccess: (emp) => (
          toast({ tone: "success", title: "Xodim qoʻshildi", description: `${emp.fullName} — login: ${emp.login}` }),
          close()
        ),
      },
    );
  }

  return (
    <Drawer
      open={open}
      onClose={close}
      size="lg"
      kind="Xodim"
      title="Yangi xodim"
      actions={
        <>
          <Button variant="secondary" onClick={close}>
            Ortga
          </Button>
          <Button loading={create.isPending} onClick={() => submit()}>
            Xodimni saqlash
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="grid grid-cols-2 gap-4">
        <TextField
          label="F.I.Sh."
          value={form.fullName}
          onChange={set("fullName")}
          error={err.fields.fullName}
          required
          className="col-span-2"
        />
        <TextField label="Login" value={form.login} onChange={set("login")} error={err.fields.login} required />
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
          options={(branches.data ?? []).map((b) => ({ value: String(b.id), label: b.name, sub: b.code }))}
        />
        <TextField label="Lavozim" value={form.position} onChange={set("position")} error={err.fields.position} />
        <TextField label="Telefon" value={form.phone} onChange={set("phone")} error={err.fields.phone} />
        <TextField
          label="Vaqtinchalik parol"
          variant="password"
          value={form.temporaryPassword}
          onChange={set("temporaryPassword")}
          error={err.fields.temporaryPassword}
          hint="Kamida 8 belgi"
          autoComplete="new-password"
          required
        />
        {err.message ? <Alert tone="danger" title={err.message} className="col-span-2" /> : null}
      </form>
    </Drawer>
  );
}
