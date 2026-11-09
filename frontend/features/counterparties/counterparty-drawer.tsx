"use client";

import { Ban, FileText, LockOpen, Pencil, Plus, Power, PowerOff, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Drawer } from "@/components/ui/drawer";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/selection-controls";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/system-states";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { useDictionary } from "@/features/dictionaries/api";
import { useBranchList } from "@/features/organization/api";
import { DeactivateDialog } from "@/features/organization/deactivate-dialog";
import { useEmployeeOptions } from "@/features/products/api";
import { describeError } from "@/features/setup/form-error";
import { formatMoney } from "@/lib/format";
import {
  canBlockCard,
  canEditCard,
  PAYMENT_TYPE_VALUES,
  formatIsoDate,
  parseMoneyInput,
  parseUzDate,
  useActivateCounterparty,
  useBlockCounterparty,
  useCounterparty,
  useSaveContract,
  useSaveCounterparty,
  useSaveLicense,
  useSaveTerms,
  usePriceTypes,
  type Contract,
  type CounterpartyDetail,
  type CounterpartyRequest,
  type CounterpartyRole,
  type License,
  type Terms,
} from "./api";
import { LicenseBadge, StatusBadge } from "./counterparties-page";

const KIND_VALUES = ["PHARMACY", "CLINIC", "HOSPITAL", "DISTRIBUTOR", "MAKER"] as const;

export function CounterpartyDrawer({
  counterpartyId,
  defaultRole,
  canEdit,
  onClose,
  onCreated,
}: {
  counterpartyId: number | null;
  defaultRole: CounterpartyRole;
  canEdit: boolean;
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const t = useTranslations("counterparties.drawer");
  const tc = useTranslations("common");
  const cp = useCounterparty(counterpartyId);
  const me = useMe();
  const [tab, setTab] = useState("main");
  if (counterpartyId !== null && cp.error)
    return (
      <Drawer open onClose={onClose} size="lg" kind={t("kind")} title={t("kind")}>
        <ErrorState onRetry={() => cp.refetch()} />
      </Drawer>
    );
  if (counterpartyId !== null && !cp.data)
    return (
      <Drawer open onClose={onClose} size="lg" kind={t("kind")} title={tc("loading")}>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-2/3" />
        </div>
      </Drawer>
    );
  const c = cp.data ?? null;
  const cardEdit = c ? canEditCard(me.data?.permissions, c.customer, c.supplier) : canEdit;
  const licenseEdit = can(me.data, "clients.lic");
  const tabs = c
    ? {
        items: [
          { key: "main", label: t("tabs.main") },
          { key: "licenses", label: t("tabs.licenses"), count: c.licenses.length },
          { key: "contracts", label: t("tabs.contracts"), count: c.contracts.length },
          { key: "terms", label: t("tabs.terms") },
        ],
        value: tab,
        onChange: setTab,
      }
    : undefined;
  return (
    <Drawer
      open
      onClose={onClose}
      size="lg"
      kind={c ? (c.customer && c.supplier ? t("kindBoth") : c.customer ? t("kindCustomer") : t("kindSupplier")) : t("kind")}
      title={c ? c.name : defaultRole === "CUSTOMER" ? t("newCustomer") : t("newSupplier")}
      subtitle={c?.tin}
      status={c ? <StatusBadge blocked={c.blocked} active={c.active} /> : undefined}
      tabs={tabs}
    >
      {tab === "main" || !c ? (
        <MainTab
          key={c ? `${c.id}-${c.blocked}-${c.active}` : "new"}
          cp={c}
          defaultRole={defaultRole}
          canEdit={cardEdit}
          onClose={onClose}
          onCreated={onCreated}
        />
      ) : null}
      {tab === "licenses" && c ? <LicensesTab cp={c} canEdit={licenseEdit} /> : null}
      {tab === "contracts" && c ? <ContractsTab cp={c} canEdit={cardEdit} /> : null}
      {tab === "terms" && c ? <TermsTab cp={c} /> : null}
    </Drawer>
  );
}

function MainTab({
  cp,
  defaultRole,
  canEdit,
  onClose,
  onCreated,
}: {
  cp: CounterpartyDetail | null;
  defaultRole: CounterpartyRole;
  canEdit: boolean;
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const tm = useTranslations("counterparties.main");
  const tk = useTranslations("counterparties.overview");
  const me = useMe();
  const save = useSaveCounterparty();
  const block = useBlockCounterparty();
  const activate = useActivateCounterparty();
  const regions = useDictionary("REGION");
  const [dialog, setDialog] = useState<"block" | "deactivate" | null>(null);
  const [form, setForm] = useState({
    tin: cp?.tin ?? "",
    name: cp?.name ?? "",
    legalName: cp?.legalName ?? "",
    customer: cp ? cp.customer : defaultRole === "CUSTOMER",
    supplier: cp ? cp.supplier : defaultRole === "SUPPLIER",
    regionId: cp?.region ? String(cp.region.id) : null,
    kind: (cp?.kind ?? null) as string | null,
    address: cp?.address ?? "",
    phone: cp?.phone ?? "",
    contactPerson: cp?.contactPerson ?? "",
    email: cp?.email ?? "",
    bankName: cp?.bankName ?? "",
    bankAccount: cp?.bankAccount ?? "",
    bankMfo: cp?.bankMfo ?? "",
    vatCode: cp?.vatCode ?? "",
    note: cp?.note ?? "",
  });
  const err = describeError(save.error);
  const set =
    <K extends keyof typeof form>(k: K) =>
    (v: (typeof form)[K]) =>
      setForm((f) => ({ ...f, [k]: v }));
  const canBlock = cp ? canBlockCard(me.data?.permissions, cp.customer, cp.supplier) : false;

  function submit(e?: FormEvent) {
    e?.preventDefault();
    const t = (v: string) => v.trim() || undefined;
    save.mutate(
      {
        id: cp?.id,
        body: {
          tin: form.tin.trim(),
          name: form.name,
          legalName: t(form.legalName),
          customer: form.customer,
          supplier: form.supplier,
          regionId: form.regionId ? Number(form.regionId) : undefined,
          kind: (form.kind ?? undefined) as CounterpartyRequest["kind"],
          address: t(form.address),
          phone: t(form.phone),
          contactPerson: t(form.contactPerson),
          email: t(form.email),
          bankName: t(form.bankName),
          bankAccount: t(form.bankAccount),
          bankMfo: t(form.bankMfo),
          vatCode: t(form.vatCode),
          note: t(form.note),
        },
      },
      {
        onSuccess: (c) => {
          toast({ tone: "success", title: cp ? tm("saved") : tm("created"), description: `${c.name} · ${c.tin}` });
          if (!cp) onCreated(c.id);
        },
      },
    );
  }

  return (
    <>
      {cp?.blocked ? <Alert tone="danger" title={tm("blockedReason", { reason: cp.blockedReason ?? "" })} className="mb-4" /> : null}
      <form onSubmit={submit} noValidate className="grid grid-cols-2 gap-4">
        <fieldset disabled={!canEdit} className="contents">
          <TextField
            label={tm("tin")}
            value={form.tin}
            onChange={set("tin")}
            error={err.fields.tin}
            inputMode="numeric"
            maxLength={14}
            required
          />
          <TextField label={tm("name")} value={form.name} onChange={set("name")} error={err.fields.name} required />
          <TextField
            label={tm("legalName")}
            value={form.legalName}
            onChange={set("legalName")}
            error={err.fields.legalName}
            className="col-span-2"
          />
          <div className="col-span-2 flex gap-6">
            <Checkbox label={tm("customer")} checked={form.customer} disabled={!canEdit} onChange={set("customer")} />
            <Checkbox label={tm("supplier")} checked={form.supplier} disabled={!canEdit} onChange={set("supplier")} />
          </div>
          <Select
            label={tk("f.kind")}
            disabled={!canEdit}
            value={form.kind}
            onChange={set("kind")}
            options={KIND_VALUES.map((k) => ({ value: k, label: tk(`kind.${k}`) }))}
          />
          <Select
            label={tm("region")}
            searchable
            disabled={!canEdit}
            value={form.regionId}
            onChange={set("regionId")}
            options={(regions.data ?? [])
              .filter((r) => r.active || String(r.id) === form.regionId)
              .map((r) => ({ value: String(r.id), label: r.name }))}
          />
          <TextField label={tm("address")} value={form.address} onChange={set("address")} error={err.fields.address} />
          <TextField
            label={tm("phone")}
            value={form.phone}
            onChange={set("phone")}
            error={err.fields.phone}
            placeholder="+998 90 123 45 67"
          />
          <TextField
            label={tm("contactPerson")}
            value={form.contactPerson}
            onChange={set("contactPerson")}
            error={err.fields.contactPerson}
          />
          <TextField label={tm("email")} value={form.email} onChange={set("email")} error={err.fields.email} />
          <TextField
            label={tm("vatCode")}
            value={form.vatCode}
            onChange={set("vatCode")}
            error={err.fields.vatCode}
            inputMode="numeric"
            maxLength={12}
          />
          <TextField label={tm("bank")} value={form.bankName} onChange={set("bankName")} error={err.fields.bankName} />
          <TextField
            label={tm("mfo")}
            value={form.bankMfo}
            onChange={set("bankMfo")}
            error={err.fields.bankMfo}
            inputMode="numeric"
            maxLength={5}
          />
          <TextField
            label={tm("account")}
            value={form.bankAccount}
            onChange={set("bankAccount")}
            error={err.fields.bankAccount}
            inputMode="numeric"
            maxLength={20}
            className="col-span-2"
          />
          <TextField label={tm("note")} value={form.note} onChange={set("note")} error={err.fields.note} className="col-span-2" />
        </fieldset>
        {err.message ? <Alert tone="danger" title={err.message} className="col-span-2" /> : null}
        {canEdit ? (
          <div className="col-span-2 flex items-center gap-2 border-t border-border pt-4">
            {cp && canBlock ? (
              cp.blocked ? (
                <Button
                  variant="tertiary"
                  icon={LockOpen}
                  loading={block.isPending}
                  onClick={() =>
                    block.mutate({ id: cp.id, reason: null }, { onSuccess: () => toast({ tone: "success", title: tm("unblocked") }) })
                  }
                >
                  {tm("unblock")}
                </Button>
              ) : (
                <Button variant="tertiary" icon={Ban} onClick={() => (block.reset(), setDialog("block"))}>
                  {tm("block")}
                </Button>
              )
            ) : null}
            {cp ? (
              cp.active ? (
                <Button variant="tertiary" icon={PowerOff} onClick={() => (activate.reset(), setDialog("deactivate"))}>
                  {tm("deactivate")}
                </Button>
              ) : (
                <Button
                  variant="tertiary"
                  icon={Power}
                  loading={activate.isPending}
                  onClick={() =>
                    activate.mutate({ id: cp.id, reason: null }, { onSuccess: () => toast({ tone: "success", title: tm("activated") }) })
                  }
                >
                  {tm("activate")}
                </Button>
              )
            ) : null}
            <div className="ml-auto flex gap-2">
              <Button variant="secondary" onClick={onClose}>
                {tm("back")}
              </Button>
              <Button type="submit" loading={save.isPending}>
                {tm("save")}
              </Button>
            </div>
          </div>
        ) : null}
      </form>
      {dialog && cp ? (
        <DeactivateDialog
          title={dialog === "block" ? tm("blockTitle", { name: cp.name }) : tm("deactivateTitle", { name: cp.name })}
          consequence={dialog === "block" ? tm("blockConsequence") : tm("deactivateConsequence")}
          actionLabel={dialog === "block" ? tm("blockAction") : tm("deactivateAction")}
          pending={dialog === "block" ? block.isPending : activate.isPending}
          error={dialog === "block" ? block.error : activate.error}
          onClose={() => setDialog(null)}
          onConfirm={(reason) =>
            (dialog === "block" ? block : activate).mutate(
              { id: cp.id, reason },
              {
                onSuccess: () => (
                  toast({ tone: "success", title: dialog === "block" ? tm("blockedToast") : tm("deactivatedToast"), description: cp.name }),
                  setDialog(null)
                ),
              },
            )
          }
        />
      ) : null}
    </>
  );
}

function LicensesTab({ cp, canEdit }: { cp: CounterpartyDetail; canEdit: boolean }) {
  const t = useTranslations("counterparties.licenses");
  const [editing, setEditing] = useState<License | "new" | null>(null);
  return (
    <div className="flex flex-col gap-3">
      {canEdit ? (
        <div>
          <Button variant="secondary" icon={Plus} onClick={() => setEditing("new")}>
            {t("add")}
          </Button>
        </div>
      ) : null}
      {cp.licenses.length === 0 ? (
        <EmptyState icon={ShieldCheck} title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-card border border-border">
          {cp.licenses.map((l) => (
            <li key={l.id} className="flex items-center gap-4 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {l.kind} · <span className="font-mono">{l.number}</span>
                </div>
                <div className="text-caption text-text-secondary">
                  {l.issuedOn ? t("issued", { date: formatIsoDate(l.issuedOn) }) : t("noIssued")}
                  {l.controlledAllowed ? t("controlledSuffix") : ""}
                </div>
              </div>
              <LicenseBadge validUntil={l.validUntil} />
              {canEdit ? <Button variant="icon" icon={Pencil} aria-label={t("edit")} onClick={() => setEditing(l)} /> : null}
            </li>
          ))}
        </ul>
      )}
      {editing ? <LicenseDialog cpId={cp.id} license={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function LicenseDialog({ cpId, license, onClose }: { cpId: number; license: License | null; onClose: () => void }) {
  const t = useTranslations("counterparties.licenses");
  const dp = useTranslations("counterparties")("datePlaceholder");
  const save = useSaveLicense();
  const [number, setNumber] = useState(license?.number ?? "");
  const [kind, setKind] = useState(license?.kind ?? "Farmatsevtika faoliyati");
  const [issuedOn, setIssuedOn] = useState(formatIsoDate(license?.issuedOn));
  const [validUntil, setValidUntil] = useState(formatIsoDate(license?.validUntil));
  const [controlled, setControlled] = useState(license?.controlledAllowed ?? false);
  const [local, setLocal] = useState<Record<string, string>>({});
  const err = describeError(save.error);
  return (
    <Modal
      open
      onClose={onClose}
      title={license ? t("editTitle") : t("newTitle")}
      primaryAction={{
        label: t("save"),
        loading: save.isPending,
        onClick: () => {
          const i = parseUzDate(issuedOn);
          const v = parseUzDate(validUntil);
          const e: Record<string, string> = {};
          if (i === null) e.issuedOn = t("issuedError");
          if (v === null) e.validUntil = t("validError");
          setLocal(e);
          if (i === null || v === null) return;
          save.mutate(
            { id: cpId, licenseId: license?.id, body: { number, kind, issuedOn: i, validUntil: v, controlledAllowed: controlled } },
            { onSuccess: () => (toast({ tone: "success", title: t("saved") }), onClose()) },
          );
        },
      }}
    >
      <div className="grid grid-cols-2 gap-4">
        <TextField label={t("kind")} value={kind} onChange={setKind} error={err.fields.kind} required className="col-span-2" />
        <TextField
          label={t("number")}
          value={number}
          onChange={setNumber}
          error={err.fields.number}
          required
          autoFocus
          className="col-span-2"
        />
        <TextField label={t("issuedOn")} value={issuedOn} onChange={setIssuedOn} error={local.issuedOn} placeholder={dp} />
        <TextField
          label={t("validUntil")}
          value={validUntil}
          onChange={setValidUntil}
          error={local.validUntil}
          placeholder={dp}
          hint={t("validHint")}
        />
        <div className="col-span-2">
          <Checkbox label={t("controlled")} checked={controlled} onChange={setControlled} />
        </div>
        {err.message ? <Alert tone="danger" title={err.message} className="col-span-2" /> : null}
      </div>
    </Modal>
  );
}

function ContractsTab({ cp, canEdit }: { cp: CounterpartyDetail; canEdit: boolean }) {
  const t = useTranslations("counterparties.contracts");
  const branches = useBranchList();
  const [editing, setEditing] = useState<Contract | "new" | null>(null);
  const branchName = (id: number) => branches.data?.find((b) => b.id === id)?.name ?? "";
  return (
    <div className="flex flex-col gap-3">
      {canEdit ? (
        <div>
          <Button variant="secondary" icon={Plus} onClick={() => setEditing("new")}>
            {t("add")}
          </Button>
        </div>
      ) : null}
      {cp.contracts.length === 0 ? (
        <EmptyState icon={FileText} title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-card border border-border">
          {cp.contracts.map((k) => (
            <li key={k.id} className="flex items-center gap-4 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  № <span className="font-mono">{k.number}</span> · {branchName(k.branchId)}
                </div>
                <div className="text-caption text-text-secondary">
                  {k.signedOn ? t("signed", { date: formatIsoDate(k.signedOn) }) : t("noSigned")}
                  {k.validUntil ? t("until", { date: formatIsoDate(k.validUntil) }) : ""}
                  {k.note ? ` · ${k.note}` : ""}
                </div>
              </div>
              {canEdit ? <Button variant="icon" icon={Pencil} aria-label={t("edit")} onClick={() => setEditing(k)} /> : null}
            </li>
          ))}
        </ul>
      )}
      {editing ? <ContractDialog cpId={cp.id} contract={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function ContractDialog({ cpId, contract, onClose }: { cpId: number; contract: Contract | null; onClose: () => void }) {
  const t = useTranslations("counterparties.contracts");
  const dp = useTranslations("counterparties")("datePlaceholder");
  const me = useMe();
  const branches = useBranchList();
  const save = useSaveContract();
  const active = (branches.data ?? []).filter((b) => b.active);
  const [branchId, setBranchId] = useState<string | null>(
    contract ? String(contract.branchId) : me.data?.branchId ? String(me.data.branchId) : active.length === 1 ? String(active[0].id) : null,
  );
  const [number, setNumber] = useState(contract?.number ?? "");
  const [signedOn, setSignedOn] = useState(formatIsoDate(contract?.signedOn));
  const [validUntil, setValidUntil] = useState(formatIsoDate(contract?.validUntil));
  const [note, setNote] = useState(contract?.note ?? "");
  const [local, setLocal] = useState<Record<string, string>>({});
  const err = describeError(save.error);
  return (
    <Modal
      open
      onClose={onClose}
      title={contract ? t("editTitle") : t("newTitle")}
      primaryAction={{
        label: t("save"),
        loading: save.isPending,
        onClick: () => {
          const s = parseUzDate(signedOn);
          const v = parseUzDate(validUntil);
          const e: Record<string, string> = {};
          if (!branchId) e.branchId = t("branchError");
          if (s === null) e.signedOn = t("dateError");
          if (v === null) e.validUntil = t("dateError");
          setLocal(e);
          if (!branchId || s === null || v === null) return;
          save.mutate(
            {
              id: cpId,
              contractId: contract?.id,
              body: { branchId: Number(branchId), number, signedOn: s, validUntil: v, note: note.trim() || undefined },
            },
            { onSuccess: () => (toast({ tone: "success", title: t("saved") }), onClose()) },
          );
        },
      }}
    >
      <div className="grid grid-cols-2 gap-4">
        <Select
          label={t("branch")}
          required
          value={branchId}
          onChange={setBranchId}
          error={local.branchId ?? err.fields.branchId}
          options={active.map((b) => ({ value: String(b.id), label: b.name, sub: b.code }))}
        />
        <TextField label={t("number")} value={number} onChange={setNumber} error={err.fields.number} required autoFocus />
        <TextField label={t("signedOn")} value={signedOn} onChange={setSignedOn} error={local.signedOn} placeholder={dp} />
        <TextField label={t("validUntil")} value={validUntil} onChange={setValidUntil} error={local.validUntil} placeholder={dp} />
        <TextField label={t("note")} value={note} onChange={setNote} error={err.fields.note} className="col-span-2" />
        {err.message ? <Alert tone="danger" title={err.message} className="col-span-2" /> : null}
      </div>
    </Modal>
  );
}

function TermsTab({ cp }: { cp: CounterpartyDetail }) {
  const tt = useTranslations("counterparties.terms");
  const me = useMe();
  const branches = useBranchList();
  const perms = me.data?.permissions ?? [];
  const customerSide = cp.customer && perms.includes("clients.terms");
  const supplierSide = cp.supplier && perms.includes("suppliers.terms");
  const visible = (branches.data ?? []).filter((b) => b.active || cp.terms.some((t) => t.branchId === b.id));
  if (!branches.data) return <Skeleton className="h-40 w-full" />;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-text-secondary">{tt("intro")}</p>
      {visible.map((b) => (
        <TermsCard
          key={b.id}
          cp={cp}
          branchId={b.id}
          branchName={b.name}
          terms={cp.terms.find((t) => t.branchId === b.id) ?? null}
          customerSide={customerSide}
          supplierSide={supplierSide}
        />
      ))}
    </div>
  );
}

function TermsCard({
  cp,
  branchId,
  branchName,
  terms,
  customerSide,
  supplierSide,
}: {
  cp: CounterpartyDetail;
  branchId: number;
  branchName: string;
  terms: Terms | null;
  customerSide: boolean;
  supplierSide: boolean;
}) {
  const tt = useTranslations("counterparties.terms");
  const tcp = useTranslations("counterparties");
  const canEdit = customerSide || supplierSide;
  const save = useSaveTerms();
  const priceTypes = usePriceTypes();
  const employees = useEmployeeOptions();
  const [f, setF] = useState({
    creditLimit: terms?.creditLimit ? formatMoney(terms.creditLimit) : "",
    paymentDays: terms?.paymentDays != null ? String(terms.paymentDays) : "",
    priceTypeId: terms?.priceType ? String(terms.priceType.id) : null,
    minShelfLifeDays: terms?.minShelfLifeDays != null ? String(terms.minShelfLifeDays) : "",
    operatorId: terms?.operator ? String(terms.operator.id) : null,
    supplierPaymentDays: terms?.supplierPaymentDays != null ? String(terms.supplierPaymentDays) : "",
    defaultPaymentType: (terms?.defaultPaymentType ?? null) as string | null,
    supplyEmployeeId: terms?.supplyEmployee ? String(terms.supplyEmployee.id) : null,
  });
  const [local, setLocal] = useState<Record<string, string>>({});
  const err = describeError(save.error);
  const set =
    <K extends keyof typeof f>(k: K) =>
    (v: (typeof f)[K]) =>
      setF((s) => ({ ...s, [k]: v }));
  const empOptions = (employees.data ?? []).map((e) => ({ value: String(e.id), label: e.fullName, sub: e.roleName }));

  function submit() {
    const e: Record<string, string> = {};
    const limit = parseMoneyInput(f.creditLimit);
    if (limit === null) e.creditLimit = tt("limitError");
    const int = (raw: string, key: string, max: number) => {
      const t = raw.trim();
      if (!t) return undefined;
      if (!/^\d+$/.test(t) || Number(t) > max) {
        e[key] = tt("intError", { max });
        return undefined;
      }
      return Number(t);
    };
    const body = {
      creditLimit: limit ?? undefined,
      paymentDays: int(f.paymentDays, "paymentDays", 365),
      priceTypeId: f.priceTypeId ? Number(f.priceTypeId) : undefined,
      minShelfLifeDays: int(f.minShelfLifeDays, "minShelfLifeDays", 3650),
      operatorId: f.operatorId ? Number(f.operatorId) : undefined,
      supplierPaymentDays: int(f.supplierPaymentDays, "supplierPaymentDays", 365),
      defaultPaymentType: (f.defaultPaymentType as "CASH" | "TRANSFER" | "ONLINE" | null) ?? undefined,
      supplyEmployeeId: f.supplyEmployeeId ? Number(f.supplyEmployeeId) : undefined,
    };
    setLocal(e);
    if (Object.keys(e).length > 0) return;
    save.mutate(
      { id: cp.id, branchId, body },
      { onSuccess: () => toast({ tone: "success", title: tt("saved"), description: branchName }) },
    );
  }

  const fe = (k: string) => local[k] ?? err.fields[k];
  return (
    <Card
      title={branchName}
      actions={
        canEdit ? (
          <Button variant="secondary" size="sm" loading={save.isPending} onClick={submit}>
            {tt("save")}
          </Button>
        ) : undefined
      }
    >
      <div className="grid grid-cols-2 gap-4">
        {cp.customer ? (
          <fieldset disabled={!customerSide} className="contents">
            <div className="col-span-2 text-label text-text-secondary">{tt("asCustomer")}</div>
            <TextField
              label={tt("creditLimit")}
              value={f.creditLimit}
              onChange={set("creditLimit")}
              error={fe("creditLimit")}
              suffix={tt("sum")}
              inputMode="decimal"
              hint={tt("creditLimitHint")}
            />
            <TextField
              label={tt("paymentDays")}
              value={f.paymentDays}
              onChange={set("paymentDays")}
              error={fe("paymentDays")}
              suffix={tt("days")}
              inputMode="numeric"
            />
            <Select
              label={tt("priceType")}
              disabled={!customerSide}
              value={f.priceTypeId}
              onChange={set("priceTypeId")}
              placeholder={tt("priceTypeBase")}
              options={(priceTypes.data ?? []).map((p) => ({ value: String(p.id), label: p.name }))}
            />
            <TextField
              label={tt("minShelfLife")}
              value={f.minShelfLifeDays}
              onChange={set("minShelfLifeDays")}
              error={fe("minShelfLifeDays")}
              suffix={tt("days")}
              inputMode="numeric"
              hint={tt("minShelfLifeHint")}
            />
            <Select
              label={tt("operator")}
              searchable
              disabled={!customerSide}
              value={f.operatorId}
              onChange={set("operatorId")}
              options={empOptions}
              className="col-span-2"
            />
          </fieldset>
        ) : null}
        {cp.supplier ? (
          <fieldset disabled={!supplierSide} className="contents">
            <div className="col-span-2 text-label text-text-secondary">{tt("asSupplier")}</div>
            <TextField
              label={tt("supplierPaymentDays")}
              value={f.supplierPaymentDays}
              onChange={set("supplierPaymentDays")}
              error={fe("supplierPaymentDays")}
              suffix={tt("days")}
              inputMode="numeric"
            />
            <Select
              label={tt("defaultPaymentType")}
              disabled={!supplierSide}
              value={f.defaultPaymentType}
              onChange={set("defaultPaymentType")}
              options={PAYMENT_TYPE_VALUES.map((value) => ({ value, label: tcp(`paymentType.${value}`) }))}
            />
            <Select
              label={tt("supplyEmployee")}
              searchable
              disabled={!supplierSide}
              value={f.supplyEmployeeId}
              onChange={set("supplyEmployeeId")}
              options={empOptions}
              className="col-span-2"
            />
          </fieldset>
        ) : null}
      </div>
      {err.message ? <Alert tone="danger" title={err.message} className="mt-4" /> : null}
    </Card>
  );
}
