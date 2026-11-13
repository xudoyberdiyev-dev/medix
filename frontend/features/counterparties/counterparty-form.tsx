"use client";

import { Check, CircleAlert, Info, Plus, Trash2, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { ErrorState, Skeleton } from "@/components/ui/system-states";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { useDictionary } from "@/features/dictionaries/api";
import { useBranchList } from "@/features/organization/api";
import { describeError } from "@/features/setup/form-error";
import { cn } from "@/lib/cn";
import {
  useCounterparties,
  useCounterparty,
  usePriceTypes,
  useSaveCounterparty,
  useSaveLicense,
  useSaveTerms,
  type CounterpartyRole,
} from "./api";
import {
  emptyForm,
  formFromDetail,
  licenseRequests,
  sameForm,
  termsRequest,
  toRequest,
  validateForm,
  type CpForm,
  type ErrKey,
  type PaymentType,
} from "./form-model";

const KIND_VALUES = ["PHARMACY", "CLINIC", "HOSPITAL", "DISTRIBUTOR", "MAKER"] as const;
const PAY_VALUES: PaymentType[] = ["TRANSFER", "CASH", "ONLINE"];

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const h = setTimeout(() => setV(value), ms);
    return () => clearTimeout(h);
  }, [value, ms]);
  return v;
}

/** Kontragent shakli — toʻliq sahifa (prototip CounterpartyForm): yangi (`/customers/new`) va tahrir (`/customers/[id]/edit`). */
export function CounterpartyFormPage({ role, id = null }: { role: CounterpartyRole; id?: number | null }) {
  const cp = useCounterparty(id);
  const me = useMe();
  if (id !== null && cp.error) return <ErrorState onRetry={() => cp.refetch()} />;
  if ((id !== null && !cp.data) || !me.data) {
    return (
      <div className="mx-auto flex w-full max-w-[880px] flex-col gap-4" aria-busy>
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  const c = cp.data ?? null;
  const initial = c ? formFromDetail(c) : emptyForm(me.data.branchId != null ? String(me.data.branchId) : null);
  return <FormBody key={id ?? "new"} role={role} cp={c} initial={initial} />;
}

function FormBody({
  role,
  cp,
  initial,
}: {
  role: CounterpartyRole;
  cp: ReturnType<typeof useCounterparty>["data"] | null;
  initial: CpForm;
}) {
  const t = useTranslations("counterparties.form");
  const tm = useTranslations("counterparties.main");
  const tk = useTranslations("counterparties.overview");
  const tt = useTranslations("counterparties.terms");
  const tp = useTranslations("counterparties.paymentType");
  const router = useRouter();
  const me = useMe();
  const isNew = cp === null;
  const supplier = role === "SUPPLIER";
  const base = supplier ? "/suppliers" : "/customers";
  const [f, setF] = useState<CpForm>(initial);
  const [saved, setSaved] = useState<CpForm>(initial);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [leave, setLeave] = useState<(() => void) | null>(null);
  const top = useRef<HTMLDivElement>(null);
  const save = useSaveCounterparty();
  const saveLicense = useSaveLicense();
  const saveTerms = useSaveTerms();
  const regions = useDictionary("REGION");
  const branches = useBranchList();
  const priceTypes = usePriceTypes();
  const dirty = !sameForm(f, saved);
  const canTerms = can(me.data, supplier ? "suppliers.terms" : "clients.terms");
  const canCard = can(me.data, supplier ? "suppliers.create" : "clients.create");
  const set =
    <K extends keyof CpForm>(k: K) =>
    (v: CpForm[K]) =>
      setF((s) => ({ ...s, [k]: v }));

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Takror STIR va oʻxshash nomlar (faqat yangi kartada)
  const tinQ = useDebounced(f.tin.replace(/\s/g, ""), 300);
  const nameQ = useDebounced(f.name.trim(), 400);
  const listArgs = { role, status: "ALL" as const, regionId: null, sort: "NAME" as const, desc: false, page: 1, size: 20 as const };
  const tinOk = isNew && /^(\d{9}|\d{14})$/.test(tinQ);
  const byTin = useCounterparties({ ...listArgs, q: tinQ }, tinOk);
  const byName = useCounterparties({ ...listArgs, q: nameQ }, isNew && nameQ.length >= 3);
  const dup = tinOk ? (byTin.data?.items.find((x) => x.tin === tinQ) ?? null) : null;
  const similar = isNew && !dup && nameQ.length >= 3 ? (byName.data?.items ?? []).filter((x) => x.tin !== tinQ).slice(0, 3) : [];

  const branchOpts = (branches.data ?? [])
    .filter((b) => b.active && (me.data?.allBranches || b.id === me.data?.branchId))
    .map((b) => ({ value: String(b.id), label: b.name }));
  // Filial tanlanmagan boʻlsa (masalan, Direktor) — birinchi ruxsat etilgan filial
  const eff: CpForm = { ...f, branchId: f.branchId ?? branchOpts[0]?.value ?? null };
  const serverErr = describeError(save.error ?? saveLicense.error ?? saveTerms.error);
  const local = tried ? validateForm(eff, { isNew, supplier, terms: canTerms }) : {};
  const err = (k: ErrKey): string | undefined => {
    const e = local[k];
    if (e) return t(`errors.${e}`);
    return (serverErr.fields as Record<string, string | undefined>)[k];
  };
  const errCount = Object.keys(local).length;

  const guard = (fn: () => void) => (dirty ? setLeave(() => fn) : fn());
  const back = () => guard(() => router.push(cp ? `${base}/${cp.id}` : base));
  const focusField = (k: string) => {
    const el = top.current?.querySelector<HTMLElement>(`[data-f="${k}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.querySelector<HTMLElement>("input,button,textarea")?.focus({ preventScroll: true });
  };

  const submit = async () => {
    setTried(true);
    const e = Object.keys(validateForm(eff, { isNew, supplier, terms: canTerms }));
    if (e.length) return setTimeout(() => focusField(e[0]), 0);
    if (dup) return top.current?.scrollIntoView({ behavior: "smooth" });
    setBusy(true);
    let created: number | null = null;
    try {
      const roles = cp ? { customer: cp.customer, supplier: cp.supplier } : { customer: !supplier, supplier };
      const c = await save.mutateAsync({ id: cp?.id, body: toRequest(f, roles) });
      if (isNew) {
        created = c.id;
        for (const body of licenseRequests(f)) await saveLicense.mutateAsync({ id: c.id, body });
        if (canTerms && eff.branchId)
          await saveTerms.mutateAsync({ id: c.id, branchId: Number(eff.branchId), body: termsRequest(f, supplier) });
      }
      setSaved(f);
      toast({ tone: "success", title: isNew ? tm("created") : tm("saved"), description: `${c.name} · ${c.tin}` });
      router.push(`${base}/${c.id}`);
    } catch {
      // Xato maydon ostida va yuqorida koʻrsatiladi; karta yaratilgan boʻlsa — kartochkada davom ettiriladi
      if (created !== null) router.push(`${base}/${created}`);
    } finally {
      setBusy(false);
    }
  };

  const contactsSet = (i: number, k: "name" | "position" | "phone") => (v: string) =>
    setF((s) => ({ ...s, contacts: s.contacts.map((x, j) => (j === i ? { ...x, [k]: v } : x)) }));

  const title = cp ? cp.name : supplier ? t("newS") : t("newC");
  return (
    <div ref={top} className="mx-auto flex w-full max-w-[880px] flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <nav className="flex items-center gap-1.5 text-caption">
          <button type="button" onClick={() => guard(() => router.push(base))} className="text-primary-button hover:underline">
            {supplier ? tk("titleS") : tk("titleC")}
          </button>
          <span className="text-text-secondary">/</span>
          <span className="text-text-secondary">{cp ? t("crumbEdit") : title}</span>
        </nav>
        <h1 className="text-[22px] leading-7 font-semibold tracking-[-0.01em]">{title}</h1>
      </div>
      {tried && errCount > 0 ? (
        <Banner tone="danger" icon={CircleAlert}>
          <span className="font-medium">{t("errorsT", { n: String(errCount) })}</span>
        </Banner>
      ) : null}
      {serverErr.message ? (
        <Banner tone="danger" icon={CircleAlert}>
          <span>{serverErr.message}</span>
        </Banner>
      ) : null}
      {dup ? (
        <Banner tone="warning" icon={TriangleAlert}>
          <span className="font-medium">{t(supplier ? "dupS" : "dupC", { name: dup.name })}</span>
          <span>{t("dupText")}</span>
          <span>
            <Button variant="secondary" size="sm" onClick={() => router.push(`${base}/${dup.id}?tab=terms`)}>
              {t("dupOpen")}
            </Button>
          </span>
        </Banner>
      ) : null}
      {similar.map((x) => (
        <div
          key={x.id}
          role="status"
          className="flex items-center gap-2 rounded-control border border-warning/30 bg-warning-bg px-3.5 py-2.5 text-warning"
        >
          <Icon icon={TriangleAlert} className="flex-none" />
          <span className="min-w-0 flex-1">{t("similar", { name: x.name, tin: x.tin })}</span>
          <button type="button" className="font-medium underline" onClick={() => guard(() => router.push(`${base}/${x.id}`))}>
            {t("open")}
          </button>
        </div>
      ))}

      <fieldset disabled={!canCard} className="contents">
        <Section title={t("secMain")} description={t("secMainD")}>
          <div className="grid grid-cols-2 gap-4">
            <div data-f="tin">
              <TextField
                label={tm("tin")}
                value={f.tin}
                onChange={set("tin")}
                error={err("tin")}
                inputMode="numeric"
                maxLength={17}
                placeholder="302 118 447"
                required
                disabled={!isNew}
              />
            </div>
            <div data-f="name">
              <TextField label={tm("name")} value={f.name} onChange={set("name")} error={err("name")} required maxLength={300} />
            </div>
            <div data-f="legalName" className="col-span-2">
              <TextField
                label={tm("legalName")}
                value={f.legalName}
                onChange={set("legalName")}
                error={err("legalName")}
                placeholder="«Shifo Farm» MChJ"
                maxLength={300}
              />
            </div>
            <div data-f="regionId">
              <Select
                label={tm("region")}
                searchable
                value={f.regionId}
                onChange={set("regionId")}
                options={(regions.data ?? [])
                  .filter((r) => r.active || String(r.id) === f.regionId)
                  .map((r) => ({ value: String(r.id), label: r.name }))}
              />
            </div>
            <div data-f="phone">
              <TextField label={tm("phone")} value={f.phone} onChange={set("phone")} error={err("phone")} placeholder="+998 71 000 00 00" />
            </div>
            <div data-f="address" className="col-span-2">
              <TextField label={tm("address")} value={f.address} onChange={set("address")} error={err("address")} />
            </div>
            <div data-f="email">
              <TextField label={tm("email")} value={f.email} onChange={set("email")} error={err("email")} inputMode="email" />
            </div>
            <div data-f="vatCode">
              <TextField
                label={tm("vatCode")}
                value={f.vatCode}
                onChange={set("vatCode")}
                error={err("vatCode")}
                inputMode="numeric"
                maxLength={12}
              />
            </div>
            <div data-f="kind">
              <Select
                label={tk("f.kind")}
                required
                value={f.kind}
                onChange={set("kind")}
                error={err("kind")}
                options={KIND_VALUES.map((k) => ({ value: k, label: tk(`kind.${k}`) }))}
              />
            </div>
            {supplier && isNew ? (
              <div data-f="mainPay">
                <Select
                  label={tt("defaultPaymentType")}
                  required
                  value={f.mainPay}
                  onChange={(v) => set("mainPay")(v as PaymentType | null)}
                  error={err("mainPay")}
                  options={PAY_VALUES.map((k) => ({ value: k, label: tp(k) }))}
                />
              </div>
            ) : null}
            <div data-f="note" className="col-span-2">
              <TextField label={tm("note")} value={f.note} onChange={set("note")} error={err("note")} maxLength={1000} />
            </div>
          </div>
        </Section>

        <Section title={t("secCont")} description={t("secContD")}>
          <div className="flex flex-col gap-2.5">
            {f.contacts.map((k, i) => (
              <div
                key={i}
                data-f={`contact${i}`}
                className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_34px] items-end gap-2.5"
              >
                <TextField label={t("cName")} size="sm" value={k.name} onChange={contactsSet(i, "name")} error={err(`contact${i}`)} />
                <TextField label={t("cPos")} size="sm" value={k.position} onChange={contactsSet(i, "position")} />
                <TextField label={t("cPhone")} size="sm" value={k.phone} onChange={contactsSet(i, "phone")} />
                <button
                  type="button"
                  aria-label={t("cRemove")}
                  onClick={() =>
                    setF((s) => ({
                      ...s,
                      contacts: s.contacts.length > 1 ? s.contacts.filter((_, j) => j !== i) : [{ name: "", position: "", phone: "" }],
                    }))
                  }
                  className="flex size-[34px] items-center justify-center rounded-control text-text-secondary hover:bg-danger-bg hover:text-danger"
                >
                  <Trash2 size={16} strokeWidth={1.5} aria-hidden />
                </button>
              </div>
            ))}
            {f.contacts.length < 20 ? (
              <button
                type="button"
                onClick={() => setF((s) => ({ ...s, contacts: [...s.contacts, { name: "", position: "", phone: "" }] }))}
                className="flex items-center gap-1.5 self-start text-[13px] font-medium text-primary-button hover:underline"
              >
                <Plus size={16} strokeWidth={1.5} aria-hidden />
                {t("cAdd")}
              </button>
            ) : null}
          </div>
        </Section>

        <Section title={t("secBank")} description={t("secBankD")}>
          <div className="grid grid-cols-[minmax(0,1.2fr)_120px_minmax(0,1.6fr)] gap-3">
            <div data-f="bankName">
              <TextField label={tm("bank")} value={f.bankName} onChange={set("bankName")} error={err("bankName")} />
            </div>
            <div data-f="bankMfo">
              <TextField
                label={tm("mfo")}
                value={f.bankMfo}
                onChange={set("bankMfo")}
                error={err("bankMfo")}
                inputMode="numeric"
                maxLength={5}
              />
            </div>
            <div data-f="bankAccount">
              <TextField
                label={tm("account")}
                value={f.bankAccount}
                onChange={set("bankAccount")}
                error={err("bankAccount")}
                inputMode="numeric"
                maxLength={24}
              />
            </div>
          </div>
        </Section>

        {isNew ? (
          <>
            <Section title={t("secLic")} description={t("secLicD")}>
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <div data-f="pharmNo">
                    <TextField
                      label={t("pharmNo")}
                      value={f.pharmNo}
                      onChange={set("pharmNo")}
                      error={err("pharmNo")}
                      placeholder="FA-0000-2026"
                      required
                    />
                  </div>
                  <div data-f="pharmUntil">
                    <TextField
                      variant="date"
                      label={t("until")}
                      value={f.pharmUntil}
                      onChange={set("pharmUntil")}
                      error={err("pharmUntil")}
                      placeholder={t("datePh")}
                      required
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex flex-col">
                    <span className="font-medium">{t("ctrl")}</span>
                    <span className="text-caption text-text-secondary">{t("ctrlHelp")}</span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={f.ctrl}
                    aria-label={t("ctrl")}
                    onClick={() => set("ctrl")(!f.ctrl)}
                    className={cn(
                      "flex h-5 w-9 flex-none cursor-pointer rounded-full p-0.5 transition-colors duration-150",
                      f.ctrl ? "justify-end bg-primary-button" : "justify-start bg-text-secondary",
                    )}
                  >
                    <span className="size-4 rounded-full bg-white shadow-xs" />
                  </button>
                </div>
                {f.ctrl ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div data-f="ctrlNo">
                      <TextField label={t("ctrlNo")} value={f.ctrlNo} onChange={set("ctrlNo")} error={err("ctrlNo")} required />
                    </div>
                    <div data-f="ctrlUntil">
                      <TextField
                        variant="date"
                        label={t("until")}
                        value={f.ctrlUntil}
                        onChange={set("ctrlUntil")}
                        error={err("ctrlUntil")}
                        placeholder={t("datePh")}
                        required
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            </Section>

            <Section title={t("secTerms")} description={supplier ? t("secTermsSD") : t("secTermsD")}>
              <div className="flex flex-col gap-3">
                {!canTerms ? (
                  <Banner tone="info" icon={Info}>
                    <span>{t("noTerms")}</span>
                  </Banner>
                ) : null}
                <fieldset disabled={!canTerms} className="grid grid-cols-2 gap-4">
                  <div data-f="branchId">
                    <Select
                      label={t("branch")}
                      required
                      value={eff.branchId}
                      onChange={set("branchId")}
                      error={err("branchId")}
                      disabled={!canTerms || branchOpts.length <= 1}
                      options={branchOpts}
                    />
                  </div>
                  {!supplier ? (
                    <div data-f="limit">
                      <TextField
                        label={tt("creditLimit")}
                        variant="amount"
                        suffix={tt("sum")}
                        value={f.limit}
                        onChange={set("limit")}
                        error={err("limit")}
                        hint={tt("creditLimitHint")}
                      />
                    </div>
                  ) : null}
                  <div data-f="days">
                    <TextField
                      label={supplier ? tt("supplierPaymentDays") : tt("paymentDays")}
                      suffix={tt("days")}
                      inputMode="numeric"
                      value={f.days}
                      onChange={set("days")}
                      error={err("days")}
                    />
                  </div>
                  {supplier ? (
                    <div data-f="lead">
                      <TextField
                        label={tt("leadDays")}
                        suffix={tt("days")}
                        inputMode="numeric"
                        value={f.lead}
                        onChange={set("lead")}
                        error={err("lead")}
                      />
                    </div>
                  ) : (
                    <div data-f="disc">
                      <TextField
                        label={tt("discount")}
                        suffix="%"
                        inputMode="decimal"
                        value={f.disc}
                        onChange={set("disc")}
                        error={err("disc")}
                        hint={tt("discountHint")}
                      />
                    </div>
                  )}
                  {!supplier ? (
                    <div data-f="priceTypeId">
                      <Select
                        label={tt("priceType")}
                        value={f.priceTypeId}
                        onChange={set("priceTypeId")}
                        options={[
                          { value: "", label: tt("priceTypeBase") },
                          ...(priceTypes.data ?? []).filter((p) => !p.base).map((p) => ({ value: String(p.id), label: p.name })),
                        ]}
                      />
                    </div>
                  ) : null}
                </fieldset>
              </div>
            </Section>
          </>
        ) : null}
      </fieldset>
      <div className="h-6" />

      <div className="sticky -bottom-6 z-[5] -mx-6 -mb-6 flex h-16 items-center justify-center self-stretch border-t border-border bg-surface">
        <div className="flex w-full max-w-[880px] items-center justify-between gap-3 px-6">
          <span className="flex min-w-0 items-center gap-2 text-text-secondary">
            {dirty ? (
              <>
                <span className="size-2 flex-none rounded-full bg-warning" />
                <span className="truncate">{t("dirty")}</span>
              </>
            ) : null}
          </span>
          <div className="flex flex-none gap-2">
            <Button variant="secondary" onClick={back}>
              {t("cancel")}
            </Button>
            {canCard ? (
              <Button icon={Check} loading={busy} onClick={submit}>
                {tm("save")}
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {leave ? (
        <Modal
          open
          tone="danger"
          size="sm"
          title={t("leaveT")}
          onClose={() => setLeave(null)}
          primaryAction={{
            label: t("leave"),
            onClick: () => {
              const fn = leave;
              setLeave(null);
              setSaved(f);
              setTimeout(fn, 0);
            },
          }}
          secondaryAction={{ label: t("stay"), onClick: () => setLeave(null) }}
        >
          <p>{t("leaveD")}</p>
        </Modal>
      ) : null}
    </div>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="flex flex-wrap gap-x-6 gap-y-4 rounded-card border border-border bg-surface px-6 py-5 shadow-xs">
      <div className="min-w-[180px] flex-[0_1_240px]">
        <div className="text-body font-semibold">{title}</div>
        <div className="text-caption text-text-secondary">{description}</div>
      </div>
      <div className="min-w-0 flex-[1_1_440px]">{children}</div>
    </section>
  );
}

const bannerTone = {
  danger: "border-danger/30 bg-danger-bg text-danger",
  warning: "border-warning/30 bg-warning-bg text-warning",
  info: "border-info/30 bg-info-bg text-info",
};

function Banner({ tone, icon, children }: { tone: keyof typeof bannerTone; icon: typeof Info; children: ReactNode }) {
  return (
    <div role={tone === "info" ? "note" : "alert"} className={cn("flex gap-2.5 rounded-control border px-3.5 py-3", bannerTone[tone])}>
      <Icon icon={icon} className="mt-px flex-none" />
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}
