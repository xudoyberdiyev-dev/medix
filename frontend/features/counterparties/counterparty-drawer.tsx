"use client";

import { FileText, Pencil, Plus, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/selection-controls";
import { EmptyState, Skeleton } from "@/components/ui/system-states";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { useMe } from "@/features/auth/session";
import { useBranchList } from "@/features/organization/api";
import { useEmployeeOptions } from "@/features/products/api";
import { describeError } from "@/features/setup/form-error";
import { formatMoney } from "@/lib/format";
import {
  PAYMENT_TYPE_VALUES,
  formatIsoDate,
  parseMoneyInput,
  parseUzDate,
  useSaveContract,
  useSaveLicense,
  useSaveTerms,
  usePriceTypes,
  type Contract,
  type CounterpartyDetail,
  type License,
  type Terms,
} from "./api";
import { LicenseBadge } from "./counterparties-page";

export function LicensesTab({ cp, canEdit }: { cp: CounterpartyDetail; canEdit: boolean }) {
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
        <TextField variant="date" label={t("issuedOn")} value={issuedOn} onChange={setIssuedOn} error={local.issuedOn} placeholder={dp} />
        <TextField
          variant="date"
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

export function ContractsTab({ cp, canEdit }: { cp: CounterpartyDetail; canEdit: boolean }) {
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
        <TextField variant="date" label={t("signedOn")} value={signedOn} onChange={setSignedOn} error={local.signedOn} placeholder={dp} />
        <TextField
          variant="date"
          label={t("validUntil")}
          value={validUntil}
          onChange={setValidUntil}
          error={local.validUntil}
          placeholder={dp}
        />
        <TextField label={t("note")} value={note} onChange={setNote} error={err.fields.note} className="col-span-2" />
        {err.message ? <Alert tone="danger" title={err.message} className="col-span-2" /> : null}
      </div>
    </Modal>
  );
}

export function TermsTab({ cp }: { cp: CounterpartyDetail }) {
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
    discountPct: terms?.discountPct ? terms.discountPct.replace(/\.?0+$/, "").replace(".", ",") : "",
    supplierDeliveryDays: terms?.supplierDeliveryDays != null ? String(terms.supplierDeliveryDays) : "",
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
    const disc = f.discountPct.trim().replace(",", ".");
    if (disc && !/^\d{1,2}(\.\d{1,2})?$/.test(disc)) e.discountPct = tt("pctError");
    const body = {
      discountPct: disc && !e.discountPct ? Number(disc) : undefined,
      supplierDeliveryDays: int(f.supplierDeliveryDays, "supplierDeliveryDays", 365),
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
            <TextField
              label={tt("discount")}
              value={f.discountPct}
              onChange={set("discountPct")}
              error={fe("discountPct")}
              suffix="%"
              inputMode="decimal"
              hint={tt("discountHint")}
            />
            <Select
              loading={priceTypes.isLoading}
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
            <TextField
              label={tt("leadDays")}
              value={f.supplierDeliveryDays}
              onChange={set("supplierDeliveryDays")}
              error={fe("supplierDeliveryDays")}
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
