"use client";

import { CircleAlert, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Icon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Checkbox, Switch } from "@/components/ui/selection-controls";
import { TextField } from "@/components/ui/text-field";
import { ApiError } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { cn } from "@/lib/cn";
import {
  BANKS,
  REGIONS,
  bodyFromForm,
  emptyBank,
  formFromBranch,
  suggestCode,
  validateBranch,
  type BranchBody,
  type BranchForm,
} from "./branch-form";

type Branch = components["schemas"]["Branch"];

/** Maydonlar tartibi — «Birinchi xatoga oʻtish» uchun. */
const ORDER = ["name", "code", "legalName", "tin", "vatCertNo", "region", "address", "actualAddress"];

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-[16px] border-b border-border pb-[24px] last:border-b-0">
      <div>
        <h3 className="text-table font-semibold text-text-primary">{title}</h3>
        <p className="text-caption text-text-secondary">{description}</p>
      </div>
      {children}
    </section>
  );
}

/**
 * Filial kartasi (prototip BranchPanel): asosiy, yuridik (STIR, QQS), manzil, bank rekvizitlari, masʼul shaxslar.
 * Sozlash ustasi va «Sozlamalar → Filiallar» da bir xil; saqlash `onSave` orqali (har biri oʻz API'si bilan).
 */
function BranchPanelInner({
  open,
  branch,
  onClose,
  onSave,
}: {
  open: boolean;
  /** Tahrirlash; yoʻq — yangi filial. */
  branch?: Branch | null;
  onClose: () => void;
  onSave: (body: BranchBody) => Promise<unknown>;
}) {
  const t = useTranslations("branchPanel");
  const isNew = !branch;
  const initial = useMemo(() => formFromBranch(branch), [branch]);
  const [form, setForm] = useState<BranchForm>(initial);
  const [codeTouched, setCodeTouched] = useState(!isNew);
  const [tried, setTried] = useState(false);
  const [server, setServer] = useState<{ message?: string; fields: Record<string, string> }>({ fields: {} });
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  const local = validateBranch(form, isNew);
  const errorFor = (key: string): string | undefined => {
    const k = local[key];
    if (tried && k) return t(k);
    return server.fields[key];
  };
  const errorCount = tried ? Object.keys(local).length : 0;
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  const set =
    <K extends keyof BranchForm>(key: K) =>
    (value: BranchForm[K]) => {
      setForm((f) => {
        const next = { ...f, [key]: value };
        if (key === "name" && isNew && !codeTouched) next.code = suggestCode(String(value));
        return next;
      });
    };
  const setBank = (i: number, patch: Partial<BranchForm["banks"][number]>) =>
    setForm((f) => ({ ...f, banks: f.banks.map((b, j) => (j === i ? { ...b, ...patch } : patch.main ? { ...b, main: false } : b)) }));

  function goFirst() {
    const first = ORDER.find((k) => local[k]) ?? Object.keys(local)[0];
    const el = bodyRef.current?.querySelector<HTMLElement>(`[data-field="${first}"] input, [data-field="${first}"] button`);
    el?.focus();
    el?.scrollIntoView({ block: "center" });
  }

  async function save() {
    setTried(true);
    if (Object.keys(local).length > 0) {
      requestAnimationFrame(goFirst);
      return;
    }
    setSaving(true);
    setServer({ fields: {} });
    try {
      await onSave(bodyFromForm(form));
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        const fields = { ...err.fieldErrors };
        if (err.code === "branch.duplicate") fields.tin = t("eStirDup");
        setServer({ message: Object.keys(err.fieldErrors).length ? undefined : err.message, fields });
      } else setServer({ message: String(err), fields: {} });
    } finally {
      setSaving(false);
    }
  }

  const requestClose = () => (dirty && !saving ? setConfirm(true) : onClose());
  const code = form.code.trim().toUpperCase() || "XXX";

  return (
    <>
      <Drawer
        open={open}
        onClose={requestClose}
        size="lg"
        title={isNew ? t("newTitle") : t("editTitle")}
        subtitle={isNew ? undefined : branch?.code}
        actions={
          <>
            <Button variant="secondary" onClick={requestClose}>
              {t("cancel")}
            </Button>
            <Button onClick={save} loading={saving}>
              {t("save")}
            </Button>
          </>
        }
      >
        <div ref={bodyRef} className="flex flex-col gap-[24px]">
          {errorCount > 0 ? (
            <div
              role="alert"
              className="flex items-center gap-[10px] rounded-card border border-danger/25 bg-danger-bg px-[14px] py-[10px] text-table text-danger"
            >
              <Icon icon={CircleAlert} />
              <span className="flex-1">{t("summary", { n: errorCount })}</span>
              <button type="button" onClick={goFirst} className="font-medium underline-offset-2 hover:underline">
                {t("goFirst")}
              </button>
            </div>
          ) : null}
          {server.message ? <Alert tone="danger" title={server.message} /> : null}

          <Section title={t("s1")} description={t("s1d")}>
            <div data-field="name">
              <TextField
                label={t("name")}
                required
                value={form.name}
                onChange={set("name")}
                placeholder={t("namePh")}
                error={errorFor("name")}
                autoFocus
              />
            </div>
            <div data-field="code" className="flex flex-col gap-[4px]">
              <div className="flex items-end gap-[12px]">
                <TextField
                  label={t("code")}
                  required
                  className="w-[146px]"
                  value={form.code}
                  maxLength={4}
                  disabled={!isNew}
                  onChange={(v) => {
                    setCodeTouched(true);
                    set("code")(v.replace(/[^A-Za-z]/g, "").toUpperCase());
                  }}
                  placeholder="TSH"
                  error={errorFor("code")}
                />
                <p className="pb-[10px] text-table text-text-secondary">
                  {t("docNo")} <span className="font-mono text-text-primary">{code}-KR-000123</span>
                </p>
              </div>
              {!errorFor("code") ? <p className="text-caption text-text-secondary">{t("codeHelp")}</p> : null}
            </div>
          </Section>

          <Section title={t("s2")} description={t("s2d")}>
            <div data-field="legalName">
              <TextField
                label={t("legal")}
                required
                value={form.legalName}
                onChange={set("legalName")}
                placeholder={t("legalPh")}
                error={errorFor("legalName")}
              />
            </div>
            <div data-field="tin" className="max-w-[226px]">
              <TextField
                label={t("stir")}
                required
                inputMode="numeric"
                maxLength={9}
                value={form.tin}
                onChange={(v) => set("tin")(v.replace(/\D/g, ""))}
                placeholder="_________"
                error={errorFor("tin")}
              />
            </div>
            <Switch label={t("vat")} description={t("vatHelp")} checked={form.vatPayer} onChange={set("vatPayer")} />
            {form.vatPayer ? (
              <div data-field="vatCertNo" className="max-w-[266px]">
                <TextField
                  label={t("vatNo")}
                  inputMode="numeric"
                  maxLength={20}
                  value={form.vatCertNo}
                  onChange={(v) => set("vatCertNo")(v.replace(/\D/g, ""))}
                  placeholder="326030012345"
                  error={errorFor("vatCertNo")}
                />
              </div>
            ) : null}
          </Section>

          <Section title={t("s3")} description={t("s3d")}>
            <div data-field="region">
              <Select
                label={t("region")}
                required
                searchable
                options={REGIONS.map((r) => ({ value: r, label: r }))}
                value={form.region || null}
                onChange={(v) => set("region")(v ?? "")}
                placeholder={t("regionPh")}
                error={errorFor("region")}
              />
            </div>
            <div data-field="address">
              <TextField
                label={t("address")}
                required
                value={form.address}
                onChange={set("address")}
                placeholder={t("addressPh")}
                error={errorFor("address")}
              />
            </div>
            <Checkbox label={t("same")} checked={form.sameAddress} onChange={set("sameAddress")} />
            {!form.sameAddress ? (
              <div data-field="actualAddress">
                <TextField
                  label={t("actual")}
                  required
                  value={form.actualAddress}
                  onChange={set("actualAddress")}
                  error={errorFor("actualAddress")}
                />
              </div>
            ) : null}
            <div className="max-w-[266px]">
              <TextField label={t("phone")} inputMode="tel" value={form.phone} onChange={set("phone")} placeholder="+998 71 200 00 00" />
            </div>
          </Section>

          <Section title={t("s4")} description={t("s4d")}>
            {form.banks.map((b, i) => (
              <div key={i} className="flex flex-col gap-[12px] rounded-card border border-border p-[16px]">
                <div className="grid grid-cols-1 gap-[12px] sm:grid-cols-[minmax(0,1fr)_96px]">
                  <div data-field={`bank.${i}`}>
                    <Select
                      label={t("bank")}
                      options={BANKS.map((x) => ({ value: x.name, label: x.name, meta: x.mfo }))}
                      value={b.bankName || null}
                      onChange={(v) => setBank(i, { bankName: v ?? "", mfo: BANKS.find((x) => x.name === v)?.mfo ?? "" })}
                      placeholder={t("bankPh")}
                      error={errorFor(`bank.${i}`)}
                    />
                  </div>
                  <TextField label={t("mfo")} value={b.mfo} onChange={() => undefined} disabled />
                </div>
                <div data-field={`account.${i}`}>
                  <TextField
                    label={t("acc")}
                    inputMode="numeric"
                    maxLength={20}
                    value={b.account}
                    onChange={(v) => setBank(i, { account: v.replace(/\D/g, "") })}
                    placeholder="20208000900100001010"
                    error={errorFor(`account.${i}`)}
                  />
                </div>
                <div className="flex items-center justify-between gap-[12px]">
                  <label className="flex items-center gap-[8px] text-table">
                    <input
                      type="radio"
                      name="main-bank"
                      checked={b.main}
                      onChange={() => setBank(i, { main: true })}
                      className="size-[16px] accent-[var(--color-primary-button)]"
                    />
                    {t("mainAcc")}
                  </label>
                  {form.banks.length > 1 ? (
                    <Button
                      variant="tertiary"
                      icon={Trash2}
                      onClick={() =>
                        setForm((f) => {
                          const banks = f.banks.filter((_, j) => j !== i);
                          if (!banks.some((x) => x.main) && banks[0]) banks[0] = { ...banks[0], main: true };
                          return { ...f, banks };
                        })
                      }
                    >
                      {t("remove")}
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
            {form.banks.length < 10 ? (
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, banks: [...f.banks, emptyBank(false)] }))}
                className={cn(
                  "flex h-[40px] items-center justify-center gap-[8px] rounded-card border border-dashed border-border text-table text-text-secondary",
                  "transition-colors duration-150 ease-out hover:border-primary-button hover:bg-primary-soft hover:text-primary-button",
                )}
              >
                <Icon icon={Plus} />
                {t("addBank")}
              </button>
            ) : null}
          </Section>

          <Section title={t("s5")} description={t("s5d")}>
            <TextField label={t("director")} value={form.directorName} onChange={set("directorName")} />
            <TextField label={t("accountant")} value={form.accountantName} onChange={set("accountantName")} />
          </Section>
        </div>
      </Drawer>
      <Modal
        open={confirm}
        size="sm"
        onClose={() => setConfirm(false)}
        title={t("cTitle")}
        primaryAction={{
          label: t("cLeave"),
          onClick: () => {
            setConfirm(false);
            onClose();
          },
        }}
        secondaryAction={{ label: t("cStay"), onClick: () => setConfirm(false) }}
      >
        <p className="text-text-secondary">{t("cText")}</p>
      </Modal>
    </>
  );
}

/** Har ochilishda forma yangidan boshlanadi (ichki komponent qayta oʻrnatiladi). */
export function BranchPanel(props: {
  open: boolean;
  branch?: Branch | null;
  onClose: () => void;
  onSave: (body: BranchBody) => Promise<unknown>;
}) {
  if (!props.open) return null;
  return <BranchPanelInner key={props.branch?.id ?? "new"} {...props} />;
}
