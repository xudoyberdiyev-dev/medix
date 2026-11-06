"use client";

import { Building2, CircleCheck, CirclePause, Pencil, Plus, Power, PowerOff } from "lucide-react";
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

export function BranchesPage() {
  const me = useMe();
  const branches = useBranchList();
  const activate = useActivateBranch();
  const deactivate = useDeactivateBranch();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Branch | "new" | null>(null);
  const [deactivating, setDeactivating] = useState<Branch | null>(null);

  if (me.data && !can(me.data, "branches.view"))
    return <ForbiddenState description="Filiallarni Direktor va Bosh administrator boshqaradi." />;

  const rows = filterBranches(branches.data ?? [], query);
  const columns: TableColumn<Branch>[] = [
    { key: "code", title: "Kod", mono: true, width: 80 },
    {
      key: "name",
      title: "Filial",
      render: (b) => (
        <span className="flex flex-col">
          <span>{b.name}</span>
          <span className="text-caption text-text-secondary">{b.legalName}</span>
        </span>
      ),
    },
    { key: "tin", title: "STIR", mono: true },
    { key: "phone", title: "Telefon" },
    { key: "address", title: "Manzil" },
    { key: "active", title: "Holat", render: (b) => <BranchStatus active={b.active} /> },
  ];

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-page-title">Filiallar</h1>
        <Button icon={Plus} onClick={() => setEditing("new")}>
          Filial qoʻshish
        </Button>
      </div>
      {branches.error ? (
        <ErrorState onRetry={() => branches.refetch()} />
      ) : (
        <Table
          caption="Filiallar"
          columns={columns}
          rows={rows}
          rowKey={(b) => String(b.id)}
          loading={branches.isPending}
          onRowClick={(b) => setEditing(b)}
          toolbar={
            <div className="w-80">
              <TextField
                label="Qidirish"
                variant="search"
                size="sm"
                value={query}
                onChange={setQuery}
                placeholder="Nom, kod yoki STIR"
                className="[&>label]:sr-only"
              />
            </div>
          }
          rowActions={(b) => (
            <RowMenu
              items={[
                {
                  key: "edit",
                  label: "Tahrirlash",
                  icon: <Pencil size={16} strokeWidth={1.5} aria-hidden />,
                  onSelect: () => setEditing(b),
                },
                b.active
                  ? {
                      key: "deactivate",
                      label: "Nofaol qilish",
                      icon: <PowerOff size={16} strokeWidth={1.5} aria-hidden />,
                      onSelect: () => (deactivate.reset(), setDeactivating(b)),
                    }
                  : {
                      key: "activate",
                      label: "Faollashtirish",
                      icon: <Power size={16} strokeWidth={1.5} aria-hidden />,
                      onSelect: () =>
                        activate.mutate(b.id, {
                          onSuccess: () => toast({ tone: "success", title: "Filial faollashtirildi", description: b.name }),
                          onError: (e) =>
                            toast({ tone: "danger", title: "Filial faollashtirilmadi", description: describeError(e).message ?? "" }),
                        }),
                    },
              ]}
            />
          )}
          emptyState={
            query ? (
              <NoResultsState onClearFilters={() => setQuery("")} />
            ) : (
              <EmptyState
                icon={Building2}
                title="Hali filial qoʻshilmagan"
                description="Har filial — alohida yuridik shaxs: kod (masalan, TSH) va STIR kerak."
              />
            )
          }
        />
      )}
      {editing ? <BranchDrawer branch={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
      {deactivating ? (
        <DeactivateDialog
          title={`${deactivating.name} filialini nofaol qilasizmi?`}
          consequence="Filial roʻyxatlarda «Nofaol» boʻlib qoladi, unga yangi ombor qoʻshilmaydi. Maʼlumotlari va tarixi saqlanadi — keyin faollashtirish mumkin."
          actionLabel="Filialni nofaol qilish"
          pending={deactivate.isPending}
          error={deactivate.error}
          onClose={() => setDeactivating(null)}
          onConfirm={(reason) =>
            deactivate.mutate(
              { id: deactivating.id, reason },
              {
                onSuccess: () => (
                  toast({ tone: "success", title: "Filial nofaol qilindi", description: deactivating.name }),
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
      toast({ tone: "success", title: branch ? "Filial saqlandi" : "Filial qoʻshildi", description: b.name }),
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
      kind="Filial"
      title={branch ? branch.name : "Yangi filial"}
      subtitle={branch?.code}
      status={branch ? <BranchStatus active={branch.active} /> : undefined}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            Ortga
          </Button>
          <Button loading={mutation.isPending} onClick={() => submit()}>
            Filialni saqlash
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="grid grid-cols-2 gap-4">
        <TextField
          label="Kod"
          value={form.code}
          onChange={(v) => set("code")(v.toUpperCase())}
          error={err.fields.code}
          hint={branch ? "Kod hujjat raqamlarida ishlatiladi — oʻzgarmaydi" : "3 ta lotin harfi, masalan TSH"}
          disabled={Boolean(branch)}
          maxLength={3}
          required
        />
        <TextField label="STIR" value={form.tin} onChange={set("tin")} error={err.fields.tin} inputMode="numeric" maxLength={9} required />
        <TextField label="Nomi" value={form.name} onChange={set("name")} error={err.fields.name} required className="col-span-2" />
        <TextField
          label="Yuridik nomi"
          value={form.legalName}
          onChange={set("legalName")}
          error={err.fields.legalName}
          required
          className="col-span-2"
        />
        <TextField label="Telefon" value={form.phone} onChange={set("phone")} error={err.fields.phone} />
        <TextField label="Manzil" value={form.address} onChange={set("address")} error={err.fields.address} />
        {err.message ? <Alert tone="danger" title={err.message} className="col-span-2" /> : null}
      </form>
    </Drawer>
  );
}
