"use client";

import { Ban, Building2, CircleCheck, KeyRound, LockOpen, UserPlus, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Modal } from "@/components/ui/modal";
import { RowMenu } from "@/components/ui/row-menu";
import { Select } from "@/components/ui/select";
import { EmptyState, ErrorState, ForbiddenState, NoResultsState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
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
  useSetAllBranches,
  useUnblockEmployee,
  type Employee,
} from "./api";

type Dialog = { kind: "block" | "reset" | "allBranches"; employee: Employee } | null;

export function EmployeesPage() {
  const t = useTranslations("employees");
  const me = useMe();
  const canEdit = can(me.data, "staff.edit");
  // E3: Buxgalterga barcha filiallar — faqat Direktor beradi
  const isDirector = me.data?.role.code === "DIRECTOR";
  const employees = useEmployees();
  const unblock = useUnblockEmployee();
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);

  if (employees.error instanceof ApiError && employees.error.isForbidden) return <ForbiddenState description={t("forbidden")} />;

  const rows = filterEmployees(employees.data ?? [], query);
  const editItems = (e: Employee) => [
    e.status === "BLOCKED"
      ? {
          key: "unblock",
          label: t("unblock"),
          icon: <LockOpen size={16} strokeWidth={1.5} aria-hidden />,
          onSelect: () =>
            unblock.mutate(e.id, {
              onSuccess: () => toast({ tone: "success", title: t("unblocked"), description: e.fullName }),
            }),
        }
      : {
          key: "block",
          label: t("block"),
          icon: <Ban size={16} strokeWidth={1.5} aria-hidden />,
          onSelect: () => setDialog({ kind: "block", employee: e }),
        },
    {
      key: "reset",
      label: t("resetPassword"),
      icon: <KeyRound size={16} strokeWidth={1.5} aria-hidden />,
      onSelect: () => setDialog({ kind: "reset", employee: e }),
    },
  ];
  const columns: TableColumn<Employee>[] = [
    {
      key: "fullName",
      title: t("employee"),
      render: (e) => (
        <span className="flex flex-col">
          <span>{e.fullName}</span>
          {e.position ? <span className="text-caption text-text-secondary">{e.position}</span> : null}
        </span>
      ),
    },
    { key: "login", title: t("login"), mono: true },
    {
      key: "roleName",
      title: t("role"),
      render: (e) => (
        <span className="flex flex-wrap items-center gap-2">
          <span>{e.roleName}</span>
          {e.allBranches ? (
            <Badge tone="info" icon={Building2}>
              {t("allBranches.badge")}
            </Badge>
          ) : null}
        </span>
      ),
    },
    {
      key: "status",
      title: t("status"),
      render: (e) =>
        e.status === "BLOCKED" ? (
          <Badge tone="danger" icon={Ban}>
            {t("blocked")}
          </Badge>
        ) : e.mustChangePassword ? (
          <Badge tone="warning" icon={KeyRound}>
            {t("mustChangePassword")}
          </Badge>
        ) : (
          <Badge tone="success" icon={CircleCheck}>
            {t("active")}
          </Badge>
        ),
    },
  ];

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-page-title">{t("title")}</h1>
        {canEdit ? (
          <Button icon={UserPlus} onClick={() => setCreating(true)}>
            {t("add")}
          </Button>
        ) : null}
      </div>
      {employees.error ? (
        <ErrorState onRetry={() => employees.refetch()} />
      ) : (
        <Table
          caption={t("title")}
          columns={columns}
          rows={rows}
          rowKey={(e) => String(e.id)}
          loading={employees.isPending}
          toolbar={
            <div className="w-80">
              <TextField
                label={t("search")}
                variant="search"
                size="sm"
                value={query}
                onChange={setQuery}
                placeholder={t("searchPlaceholder")}
                className="[&>label]:sr-only"
              />
            </div>
          }
          rowActions={(e) =>
            canEdit || (isDirector && e.roleCode === "ACCOUNTANT") ? (
              <RowMenu
                items={[
                  ...(isDirector && e.roleCode === "ACCOUNTANT"
                    ? [
                        {
                          key: "allBranches",
                          label: e.allBranches ? t("allBranches.revoke") : t("allBranches.grant"),
                          icon: <Building2 size={16} strokeWidth={1.5} aria-hidden />,
                          onSelect: () => setDialog({ kind: "allBranches", employee: e }),
                        },
                      ]
                    : []),
                  ...(canEdit ? editItems(e) : []),
                ]}
              />
            ) : null
          }
          emptyState={
            query ? (
              <NoResultsState onClearFilters={() => setQuery("")} />
            ) : (
              <EmptyState icon={Users} title={t("emptyTitle")} description={t("emptyDescription")} />
            )
          }
        />
      )}
      <CreateEmployeeDrawer open={creating} onClose={() => setCreating(false)} />
      {dialog?.kind === "block" ? <BlockDialog employee={dialog.employee} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === "reset" ? <ResetDialog employee={dialog.employee} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === "allBranches" ? <AllBranchesDialog employee={dialog.employee} onClose={() => setDialog(null)} /> : null}
    </>
  );
}

function BlockDialog({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const t = useTranslations("employees.blockDialog");
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
      title={t("title", { name: employee.fullName })}
      primaryAction={{
        label: t("action"),
        loading: block.isPending,
        onClick: () => {
          if (!reason.trim()) return setError(t("reasonRequired"));
          block.mutate(
            { id: employee.id, reason: reason.trim() },
            { onSuccess: () => (toast({ tone: "success", title: t("done"), description: employee.fullName }), onClose()) },
          );
        },
      }}
    >
      <p>{t("consequence")}</p>
      <div className="mt-4">
        <TextField label={t("reason")} value={reason} onChange={setReason} error={error ?? err.fields.reason} required autoFocus />
      </div>
      {err.message ? <Alert tone="danger" title={err.message} className="mt-4" /> : null}
    </Modal>
  );
}

/** E3: Direktor Buxgalterga barcha filiallar doirasini beradi / oladi (audit; xodim qayta kiradi). */
export function AllBranchesDialog({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const t = useTranslations("employees.allBranches");
  const set = useSetAllBranches();
  const enable = !employee.allBranches;
  const err = describeError(set.error);
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      tone={enable ? undefined : "danger"}
      title={enable ? t("grantTitle", { name: employee.fullName }) : t("revokeTitle", { name: employee.fullName })}
      primaryAction={{
        label: enable ? t("grant") : t("revoke"),
        loading: set.isPending,
        onClick: () =>
          set.mutate(
            { id: employee.id, enabled: enable },
            {
              onSuccess: () => (
                toast({ tone: "success", title: enable ? t("granted") : t("revoked"), description: employee.fullName }),
                onClose()
              ),
            },
          ),
      }}
    >
      <p className="text-text-secondary">{enable ? t("grantHint") : t("revokeHint")}</p>
      <p className="mt-2 text-text-secondary">{t("sessions")}</p>
      {err.message ? <Alert tone="danger" title={err.message} className="mt-4" /> : null}
    </Modal>
  );
}

function ResetDialog({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const t = useTranslations("employees");
  const reset = useResetPassword();
  const [password, setPassword] = useState("");
  const err = describeError(reset.error);
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={t("resetPassword")}
      primaryAction={{
        label: t("resetDialog.save"),
        loading: reset.isPending,
        onClick: () =>
          reset.mutate(
            { id: employee.id, temporaryPassword: password },
            {
              onSuccess: () => (
                toast({
                  tone: "success",
                  title: t("resetDialog.done"),
                  description: t("resetDialog.doneDescription", { name: employee.fullName }),
                }),
                onClose()
              ),
            },
          ),
      }}
    >
      <p className="mb-4 text-text-secondary">{t("resetDialog.sessions", { name: employee.fullName, login: employee.login })}</p>
      <TextField
        label={t("temporaryPassword")}
        variant="password"
        value={password}
        onChange={setPassword}
        error={err.fields.temporaryPassword}
        hint={t("passwordHint")}
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
  const t = useTranslations("employees");
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
          toast({
            tone: "success",
            title: t("create.added"),
            description: t("create.addedDescription", { name: emp.fullName, login: emp.login }),
          }),
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
      kind={t("employee")}
      title={t("create.new")}
      actions={
        <>
          <Button variant="secondary" onClick={close}>
            {t("create.back")}
          </Button>
          <Button loading={create.isPending} onClick={() => submit()}>
            {t("create.save")}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="grid grid-cols-2 gap-4">
        <TextField
          label={t("create.fullName")}
          value={form.fullName}
          onChange={set("fullName")}
          error={err.fields.fullName}
          required
          className="col-span-2"
        />
        <TextField label={t("login")} value={form.login} onChange={set("login")} error={err.fields.login} required />
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
          label={t("create.branch")}
          value={branchId}
          onChange={setBranchId}
          placeholder={t("create.allBranches")}
          hint={t("create.branchHint")}
          options={(branches.data ?? []).map((b) => ({ value: String(b.id), label: b.name, sub: b.code }))}
        />
        <TextField label={t("create.position")} value={form.position} onChange={set("position")} error={err.fields.position} />
        <TextField label={t("create.phone")} value={form.phone} onChange={set("phone")} error={err.fields.phone} />
        <TextField
          label={t("temporaryPassword")}
          variant="password"
          value={form.temporaryPassword}
          onChange={set("temporaryPassword")}
          error={err.fields.temporaryPassword}
          hint={t("passwordHint")}
          autoComplete="new-password"
          required
        />
        {err.message ? <Alert tone="danger" title={err.message} className="col-span-2" /> : null}
      </form>
    </Drawer>
  );
}
