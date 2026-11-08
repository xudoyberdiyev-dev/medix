"use client";

import { Building2, CircleCheck, CirclePause, Pencil, Plus, Power, PowerOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { RowMenu } from "@/components/ui/row-menu";
import { EmptyState, ErrorState, ForbiddenState, NoResultsState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { describeError } from "@/features/setup/form-error";
import {
  filterBranches,
  useActivateBranch,
  useBranchList,
  useCreateBranch,
  useDeactivateBranch,
  useUpdateBranch,
  type Branch,
} from "./api";
import { DeactivateDialog } from "./deactivate-dialog";

export function BranchStatus({ active }: { active: boolean }) {
  const t = useTranslations("organization");
  return active ? (
    <Badge tone="success" icon={CircleCheck}>
      {t("active")}
    </Badge>
  ) : (
    <Badge tone="neutral" icon={CirclePause}>
      {t("inactive")}
    </Badge>
  );
}

export function BranchesPage() {
  const t = useTranslations("organization");
  const me = useMe();
  const branches = useBranchList();
  const activate = useActivateBranch();
  const deactivate = useDeactivateBranch();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Branch | "new" | null>(null);
  const [deactivating, setDeactivating] = useState<Branch | null>(null);

  if (me.data && !can(me.data, "branches.view")) return <ForbiddenState description={t("branches.forbidden")} />;

  const rows = filterBranches(branches.data ?? [], query);
  const columns: TableColumn<Branch>[] = [
    { key: "code", title: t("code"), mono: true, width: 80 },
    {
      key: "name",
      title: t("branch"),
      render: (b) => (
        <span className="flex flex-col">
          <span>{b.name}</span>
          <span className="text-caption text-text-secondary">{b.legalName}</span>
        </span>
      ),
    },
    { key: "tin", title: t("tin"), mono: true },
    { key: "phone", title: t("phone") },
    { key: "address", title: t("address") },
    { key: "active", title: t("status"), render: (b) => <BranchStatus active={b.active} /> },
  ];

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-page-title">{t("branches.title")}</h1>
        <Button icon={Plus} onClick={() => setEditing("new")}>
          {t("branches.add")}
        </Button>
      </div>
      {branches.error ? (
        <ErrorState onRetry={() => branches.refetch()} />
      ) : (
        <Table
          caption={t("branches.title")}
          columns={columns}
          rows={rows}
          rowKey={(b) => String(b.id)}
          loading={branches.isPending}
          onRowClick={(b) => setEditing(b)}
          toolbar={
            <div className="w-80">
              <TextField
                label={t("search")}
                variant="search"
                size="sm"
                value={query}
                onChange={setQuery}
                placeholder={t("branches.searchPlaceholder")}
                className="[&>label]:sr-only"
              />
            </div>
          }
          rowActions={(b) => (
            <RowMenu
              items={[
                {
                  key: "edit",
                  label: t("edit"),
                  icon: <Pencil size={16} strokeWidth={1.5} aria-hidden />,
                  onSelect: () => setEditing(b),
                },
                b.active
                  ? {
                      key: "deactivate",
                      label: t("deactivate"),
                      icon: <PowerOff size={16} strokeWidth={1.5} aria-hidden />,
                      onSelect: () => (deactivate.reset(), setDeactivating(b)),
                    }
                  : {
                      key: "activate",
                      label: t("activate"),
                      icon: <Power size={16} strokeWidth={1.5} aria-hidden />,
                      onSelect: () =>
                        activate.mutate(b.id, {
                          onSuccess: () => toast({ tone: "success", title: t("branches.activated"), description: b.name }),
                          onError: (e) =>
                            toast({ tone: "danger", title: t("branches.activateFailed"), description: describeError(e).message ?? "" }),
                        }),
                    },
              ]}
            />
          )}
          emptyState={
            query ? (
              <NoResultsState onClearFilters={() => setQuery("")} />
            ) : (
              <EmptyState icon={Building2} title={t("branches.emptyTitle")} description={t("branches.emptyDescription")} />
            )
          }
        />
      )}
      {editing ? <BranchDrawer branch={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
      {deactivating ? (
        <DeactivateDialog
          title={t("branches.deactivateTitle", { name: deactivating.name })}
          consequence={t("branches.deactivateConsequence")}
          actionLabel={t("branches.deactivateAction")}
          pending={deactivate.isPending}
          error={deactivate.error}
          onClose={() => setDeactivating(null)}
          onConfirm={(reason) =>
            deactivate.mutate(
              { id: deactivating.id, reason },
              {
                onSuccess: () => (
                  toast({ tone: "success", title: t("branches.deactivated"), description: deactivating.name }),
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

function BranchDrawer({ branch, onClose }: { branch: Branch | null; onClose: () => void }) {
  const t = useTranslations("organization");
  const create = useCreateBranch();
  const update = useUpdateBranch();
  const [form, setForm] = useState({
    code: branch?.code ?? "",
    name: branch?.name ?? "",
    legalName: branch?.legalName ?? "",
    tin: branch?.tin ?? "",
    address: branch?.address ?? "",
    phone: branch?.phone ?? "",
  });
  const mutation = branch ? update : create;
  const err = describeError(mutation.error);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  function submit(e?: FormEvent) {
    e?.preventDefault();
    const body = {
      name: form.name,
      legalName: form.legalName,
      tin: form.tin,
      address: form.address || undefined,
      phone: form.phone || undefined,
    };
    const done = (b: Branch) => (
      toast({ tone: "success", title: branch ? t("branches.saved") : t("branches.added"), description: b.name }),
      onClose()
    );
    if (branch) update.mutate({ id: branch.id, body }, { onSuccess: done });
    else create.mutate({ ...body, code: form.code }, { onSuccess: done });
  }

  return (
    <Drawer
      open
      onClose={onClose}
      size="lg"
      kind={t("branch")}
      title={branch ? branch.name : t("branches.new")}
      subtitle={branch?.code}
      status={branch ? <BranchStatus active={branch.active} /> : undefined}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("back")}
          </Button>
          <Button loading={mutation.isPending} onClick={() => submit()}>
            {t("branches.save")}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="grid grid-cols-2 gap-4">
        <TextField
          label={t("code")}
          value={form.code}
          onChange={(v) => set("code")(v.toUpperCase())}
          error={err.fields.code}
          hint={branch ? t("branches.codeHintLocked") : t("branches.codeHintNew")}
          disabled={Boolean(branch)}
          maxLength={3}
          required
        />
        <TextField
          label={t("tin")}
          value={form.tin}
          onChange={set("tin")}
          error={err.fields.tin}
          inputMode="numeric"
          maxLength={9}
          required
        />
        <TextField label={t("name")} value={form.name} onChange={set("name")} error={err.fields.name} required className="col-span-2" />
        <TextField
          label={t("legalName")}
          value={form.legalName}
          onChange={set("legalName")}
          error={err.fields.legalName}
          required
          className="col-span-2"
        />
        <TextField label={t("phone")} value={form.phone} onChange={set("phone")} error={err.fields.phone} />
        <TextField label={t("address")} value={form.address} onChange={set("address")} error={err.fields.address} />
        {err.message ? <Alert tone="danger" title={err.message} className="col-span-2" /> : null}
      </form>
    </Drawer>
  );
}
