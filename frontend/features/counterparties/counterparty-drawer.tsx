"use client";

import { Ban, FileText, LockOpen, Pencil, Plus, Power, PowerOff, ShieldCheck } from "lucide-react";
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
  PAYMENT_TYPES,
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
  type CounterpartyRole,
  type License,
  type Terms,
} from "./api";
import { LicenseBadge, StatusBadge } from "./counterparties-page";

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
  const cp = useCounterparty(counterpartyId);
  const me = useMe();
  const [tab, setTab] = useState("main");
  if (counterpartyId !== null && cp.error)
    return (
      <Drawer open onClose={onClose} size="lg" kind="Kontragent" title="Kontragent">
        <ErrorState onRetry={() => cp.refetch()} />
      </Drawer>
    );
  if (counterpartyId !== null && !cp.data)
    return (
      <Drawer open onClose={onClose} size="lg" kind="Kontragent" title="Yuklanmoqda…">
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
          { key: "main", label: "Asosiy" },
          { key: "licenses", label: "Litsenziyalar", count: c.licenses.length },
          { key: "contracts", label: "Shartnomalar", count: c.contracts.length },
          { key: "terms", label: "Filial shartlari" },
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
      kind={c ? (c.customer && c.supplier ? "Mijoz · yetkazib beruvchi" : c.customer ? "Mijoz" : "Yetkazib beruvchi") : "Kontragent"}
      title={c ? c.name : defaultRole === "CUSTOMER" ? "Yangi mijoz" : "Yangi yetkazib beruvchi"}
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
          toast({ tone: "success", title: cp ? "Karta saqlandi" : "Kontragent qoʻshildi", description: `${c.name} · ${c.tin}` });
          if (!cp) onCreated(c.id);
        },
      },
    );
  }

  return (
    <>
      {cp?.blocked ? <Alert tone="danger" title={`Bloklangan: ${cp.blockedReason ?? ""}`} className="mb-4" /> : null}
      <form onSubmit={submit} noValidate className="grid grid-cols-2 gap-4">
        <fieldset disabled={!canEdit} className="contents">
          <TextField
            label="STIR / JShShIR"
            value={form.tin}
            onChange={set("tin")}
            error={err.fields.tin}
            inputMode="numeric"
            maxLength={14}
            required
          />
          <TextField label="Nomi" value={form.name} onChange={set("name")} error={err.fields.name} required />
          <TextField
            label="Yuridik nomi"
            value={form.legalName}
            onChange={set("legalName")}
            error={err.fields.legalName}
            className="col-span-2"
          />
          <div className="col-span-2 flex gap-6">
            <Checkbox label="Mijoz" checked={form.customer} disabled={!canEdit} onChange={set("customer")} />
            <Checkbox label="Yetkazib beruvchi" checked={form.supplier} disabled={!canEdit} onChange={set("supplier")} />
          </div>
          <Select
            label="Hudud"
            searchable
            disabled={!canEdit}
            value={form.regionId}
            onChange={set("regionId")}
            options={(regions.data ?? [])
              .filter((r) => r.active || String(r.id) === form.regionId)
              .map((r) => ({ value: String(r.id), label: r.name }))}
          />
          <TextField label="Manzil" value={form.address} onChange={set("address")} error={err.fields.address} />
          <TextField label="Telefon" value={form.phone} onChange={set("phone")} error={err.fields.phone} placeholder="+998 90 123 45 67" />
          <TextField label="Masʼul shaxs" value={form.contactPerson} onChange={set("contactPerson")} error={err.fields.contactPerson} />
          <TextField label="Elektron pochta" value={form.email} onChange={set("email")} error={err.fields.email} />
          <TextField
            label="QQS kodi"
            value={form.vatCode}
            onChange={set("vatCode")}
            error={err.fields.vatCode}
            inputMode="numeric"
            maxLength={12}
          />
          <TextField label="Bank" value={form.bankName} onChange={set("bankName")} error={err.fields.bankName} />
          <TextField
            label="MFO"
            value={form.bankMfo}
            onChange={set("bankMfo")}
            error={err.fields.bankMfo}
            inputMode="numeric"
            maxLength={5}
          />
          <TextField
            label="Hisob raqami"
            value={form.bankAccount}
            onChange={set("bankAccount")}
            error={err.fields.bankAccount}
            inputMode="numeric"
            maxLength={20}
            className="col-span-2"
          />
          <TextField label="Izoh" value={form.note} onChange={set("note")} error={err.fields.note} className="col-span-2" />
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
                    block.mutate({ id: cp.id, reason: null }, { onSuccess: () => toast({ tone: "success", title: "Blokdan chiqarildi" }) })
                  }
                >
                  Blokdan chiqarish
                </Button>
              ) : (
                <Button variant="tertiary" icon={Ban} onClick={() => (block.reset(), setDialog("block"))}>
                  Bloklash
                </Button>
              )
            ) : null}
            {cp ? (
              cp.active ? (
                <Button variant="tertiary" icon={PowerOff} onClick={() => (activate.reset(), setDialog("deactivate"))}>
                  Nofaol qilish
                </Button>
              ) : (
                <Button
                  variant="tertiary"
                  icon={Power}
                  loading={activate.isPending}
                  onClick={() =>
                    activate.mutate({ id: cp.id, reason: null }, { onSuccess: () => toast({ tone: "success", title: "Faollashtirildi" }) })
                  }
                >
                  Faollashtirish
                </Button>
              )
            ) : null}
            <div className="ml-auto flex gap-2">
              <Button variant="secondary" onClick={onClose}>
                Ortga
              </Button>
              <Button type="submit" loading={save.isPending}>
                Kartani saqlash
              </Button>
            </div>
          </div>
        ) : null}
      </form>
      {dialog && cp ? (
        <DeactivateDialog
          title={dialog === "block" ? `${cp.name}ni bloklaysizmi?` : `${cp.name}ni nofaol qilasizmi?`}
          consequence={
            dialog === "block"
              ? "Bloklangan mijozga buyurtma kiritilmaydi. Qarzi va tarixi saqlanadi; keyin blokdan chiqarish mumkin."
              : "Kontragent yangi hujjatlarda tanlanmaydi. Tarixi saqlanadi; keyin faollashtirish mumkin."
          }
          actionLabel={dialog === "block" ? "Kontragentni bloklash" : "Kontragentni nofaol qilish"}
          pending={dialog === "block" ? block.isPending : activate.isPending}
          error={dialog === "block" ? block.error : activate.error}
          onClose={() => setDialog(null)}
          onConfirm={(reason) =>
            (dialog === "block" ? block : activate).mutate(
              { id: cp.id, reason },
              {
                onSuccess: () => (
                  toast({ tone: "success", title: dialog === "block" ? "Bloklandi" : "Nofaol qilindi", description: cp.name }),
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
  const [editing, setEditing] = useState<License | "new" | null>(null);
  return (
    <div className="flex flex-col gap-3">
      {canEdit ? (
        <div>
          <Button variant="secondary" icon={Plus} onClick={() => setEditing("new")}>
            Litsenziya qoʻshish
          </Button>
        </div>
      ) : null}
      {cp.licenses.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="Litsenziya kiritilmagan"
          description="Muddati oʻtgan yoki litsenziyasi yoʻq mijozga buyurtma kiritilmaydi."
        />
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-card border border-border">
          {cp.licenses.map((l) => (
            <li key={l.id} className="flex items-center gap-4 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {l.kind} · <span className="font-mono">{l.number}</span>
                </div>
                <div className="text-caption text-text-secondary">
                  {l.issuedOn ? `Berilgan: ${formatIsoDate(l.issuedOn)}` : "Berilgan sana yoʻq"}
                  {l.controlledAllowed ? " · Nazoratdagi preparatlarga ruxsat" : ""}
                </div>
              </div>
              <LicenseBadge validUntil={l.validUntil} />
              {canEdit ? <Button variant="icon" icon={Pencil} aria-label="Tahrirlash" onClick={() => setEditing(l)} /> : null}
            </li>
          ))}
        </ul>
      )}
      {editing ? <LicenseDialog cpId={cp.id} license={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function LicenseDialog({ cpId, license, onClose }: { cpId: number; license: License | null; onClose: () => void }) {
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
      title={license ? "Litsenziyani tahrirlash" : "Yangi litsenziya"}
      primaryAction={{
        label: "Litsenziyani saqlash",
        loading: save.isPending,
        onClick: () => {
          const i = parseUzDate(issuedOn);
          const v = parseUzDate(validUntil);
          const e: Record<string, string> = {};
          if (i === null) e.issuedOn = "Sana KK.OO.YYYY koʻrinishida, masalan 04.10.2026.";
          if (v === null) e.validUntil = "Sana KK.OO.YYYY koʻrinishida, masalan 04.10.2027.";
          setLocal(e);
          if (i === null || v === null) return;
          save.mutate(
            { id: cpId, licenseId: license?.id, body: { number, kind, issuedOn: i, validUntil: v, controlledAllowed: controlled } },
            { onSuccess: () => (toast({ tone: "success", title: "Litsenziya saqlandi" }), onClose()) },
          );
        },
      }}
    >
      <div className="grid grid-cols-2 gap-4">
        <TextField label="Turi" value={kind} onChange={setKind} error={err.fields.kind} required className="col-span-2" />
        <TextField label="Raqami" value={number} onChange={setNumber} error={err.fields.number} required autoFocus className="col-span-2" />
        <TextField label="Berilgan sana" value={issuedOn} onChange={setIssuedOn} error={local.issuedOn} placeholder="KK.OO.YYYY" />
        <TextField
          label="Amal qilish muddati"
          value={validUntil}
          onChange={setValidUntil}
          error={local.validUntil}
          placeholder="KK.OO.YYYY"
          hint="Boʻsh — muddatsiz"
        />
        <div className="col-span-2">
          <Checkbox label="Nazoratdagi preparatlarga ruxsat" checked={controlled} onChange={setControlled} />
        </div>
        {err.message ? <Alert tone="danger" title={err.message} className="col-span-2" /> : null}
      </div>
    </Modal>
  );
}

function ContractsTab({ cp, canEdit }: { cp: CounterpartyDetail; canEdit: boolean }) {
  const branches = useBranchList();
  const [editing, setEditing] = useState<Contract | "new" | null>(null);
  const branchName = (id: number) => branches.data?.find((b) => b.id === id)?.name ?? "";
  return (
    <div className="flex flex-col gap-3">
      {canEdit ? (
        <div>
          <Button variant="secondary" icon={Plus} onClick={() => setEditing("new")}>
            Shartnoma qoʻshish
          </Button>
        </div>
      ) : null}
      {cp.contracts.length === 0 ? (
        <EmptyState icon={FileText} title="Shartnoma kiritilmagan" description="Shartnoma filial (yuridik shaxs) bilan tuziladi." />
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-card border border-border">
          {cp.contracts.map((k) => (
            <li key={k.id} className="flex items-center gap-4 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  № <span className="font-mono">{k.number}</span> · {branchName(k.branchId)}
                </div>
                <div className="text-caption text-text-secondary">
                  {k.signedOn ? `Imzolangan: ${formatIsoDate(k.signedOn)}` : "Imzo sanasi yoʻq"}
                  {k.validUntil ? ` · ${formatIsoDate(k.validUntil)} gacha` : ""}
                  {k.note ? ` · ${k.note}` : ""}
                </div>
              </div>
              {canEdit ? <Button variant="icon" icon={Pencil} aria-label="Tahrirlash" onClick={() => setEditing(k)} /> : null}
            </li>
          ))}
        </ul>
      )}
      {editing ? <ContractDialog cpId={cp.id} contract={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function ContractDialog({ cpId, contract, onClose }: { cpId: number; contract: Contract | null; onClose: () => void }) {
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
      title={contract ? "Shartnomani tahrirlash" : "Yangi shartnoma"}
      primaryAction={{
        label: "Shartnomani saqlash",
        loading: save.isPending,
        onClick: () => {
          const s = parseUzDate(signedOn);
          const v = parseUzDate(validUntil);
          const e: Record<string, string> = {};
          if (!branchId) e.branchId = "Filial tanlanmagan.";
          if (s === null) e.signedOn = "Sana KK.OO.YYYY koʻrinishida.";
          if (v === null) e.validUntil = "Sana KK.OO.YYYY koʻrinishida.";
          setLocal(e);
          if (!branchId || s === null || v === null) return;
          save.mutate(
            {
              id: cpId,
              contractId: contract?.id,
              body: { branchId: Number(branchId), number, signedOn: s, validUntil: v, note: note.trim() || undefined },
            },
            { onSuccess: () => (toast({ tone: "success", title: "Shartnoma saqlandi" }), onClose()) },
          );
        },
      }}
    >
      <div className="grid grid-cols-2 gap-4">
        <Select
          label="Filial"
          required
          value={branchId}
          onChange={setBranchId}
          error={local.branchId ?? err.fields.branchId}
          options={active.map((b) => ({ value: String(b.id), label: b.name, sub: b.code }))}
        />
        <TextField label="Raqami" value={number} onChange={setNumber} error={err.fields.number} required autoFocus />
        <TextField label="Imzolangan sana" value={signedOn} onChange={setSignedOn} error={local.signedOn} placeholder="KK.OO.YYYY" />
        <TextField
          label="Amal qilish muddati"
          value={validUntil}
          onChange={setValidUntil}
          error={local.validUntil}
          placeholder="KK.OO.YYYY"
        />
        <TextField label="Izoh" value={note} onChange={setNote} error={err.fields.note} className="col-span-2" />
        {err.message ? <Alert tone="danger" title={err.message} className="col-span-2" /> : null}
      </div>
    </Modal>
  );
}

function TermsTab({ cp }: { cp: CounterpartyDetail }) {
  const me = useMe();
  const branches = useBranchList();
  const perms = me.data?.permissions ?? [];
  const customerSide = cp.customer && perms.includes("clients.terms");
  const supplierSide = cp.supplier && perms.includes("suppliers.terms");
  const visible = (branches.data ?? []).filter((b) => b.active || cp.terms.some((t) => t.branchId === b.id));
  if (!branches.data) return <Skeleton className="h-40 w-full" />;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-text-secondary">Limit, muddat va narx turi har filial boʻyicha alohida. Qarz ham filial boʻyicha hisoblanadi.</p>
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
    if (limit === null) e.creditLimit = "Summa notoʻgʻri, masalan 15.000.000";
    const int = (raw: string, key: string, max: number) => {
      const t = raw.trim();
      if (!t) return undefined;
      if (!/^\d+$/.test(t) || Number(t) > max) {
        e[key] = `0–${max} oraligʻida butun son.`;
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
      { onSuccess: () => toast({ tone: "success", title: "Filial shartlari saqlandi", description: branchName }) },
    );
  }

  const fe = (k: string) => local[k] ?? err.fields[k];
  return (
    <Card
      title={branchName}
      actions={
        canEdit ? (
          <Button variant="secondary" size="sm" loading={save.isPending} onClick={submit}>
            Shartlarni saqlash
          </Button>
        ) : undefined
      }
    >
      <div className="grid grid-cols-2 gap-4">
        {cp.customer ? (
          <fieldset disabled={!customerSide} className="contents">
            <div className="col-span-2 text-label text-text-secondary">Mijoz sifatida</div>
            <TextField
              label="Kredit limiti"
              value={f.creditLimit}
              onChange={set("creditLimit")}
              error={fe("creditLimit")}
              suffix="soʻm"
              inputMode="decimal"
              hint="Boʻsh — limit belgilanmagan"
            />
            <TextField
              label="Toʻlov muddati"
              value={f.paymentDays}
              onChange={set("paymentDays")}
              error={fe("paymentDays")}
              suffix="kun"
              inputMode="numeric"
            />
            <Select
              label="Narx turi"
              disabled={!customerSide}
              value={f.priceTypeId}
              onChange={set("priceTypeId")}
              placeholder="Bazaviy (Narx)"
              options={(priceTypes.data ?? []).map((p) => ({ value: String(p.id), label: p.name }))}
            />
            <TextField
              label="Minimal yaroqlilik"
              value={f.minShelfLifeDays}
              onChange={set("minShelfLifeDays")}
              error={fe("minShelfLifeDays")}
              suffix="kun"
              inputMode="numeric"
              hint="Partiyaning qolgan muddati kamida shuncha boʻlsin"
            />
            <Select
              label="Operator"
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
            <div className="col-span-2 text-label text-text-secondary">Yetkazib beruvchi sifatida</div>
            <TextField
              label="Toʻlov muddati (YB)"
              value={f.supplierPaymentDays}
              onChange={set("supplierPaymentDays")}
              error={fe("supplierPaymentDays")}
              suffix="kun"
              inputMode="numeric"
            />
            <Select
              label="Asosiy toʻlov turi"
              disabled={!supplierSide}
              value={f.defaultPaymentType}
              onChange={set("defaultPaymentType")}
              options={PAYMENT_TYPES}
            />
            <Select
              label="Taʼminot masʼuli"
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
