"use client";

import { CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState, type DragEvent, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { LOCALES, type Locale } from "@/i18n/config";
import { cn } from "@/lib/cn";
import { logoProblem, logoUrl, useRemoveLogo, useSaveCompany, useUploadLogo, type SetupStatus } from "./api";
import { describeError } from "./form-error";
import { WizardFrame, type WizardFrameProps } from "./wizard-frame";

/** Til kartochkasi: nom va «Tizimga kirish» — oʻsha tilning oʻzida (prototip SetupWizard 1-qadam). */
const LANG_CARDS: Record<Locale, { name: string; sample: string }> = {
  "uz-Latn": { name: "Oʻzbekcha (lotin)", sample: "Tizimga kirish" },
  "uz-Cyrl": { name: "Ўзбекча", sample: "Тизимга кириш" },
  ru: { name: "Русский", sample: "Вход в систему" },
};

function Label({ htmlFor, children, required }: { htmlFor?: string; children: ReactNode; required?: boolean }) {
  const Tag = htmlFor ? "label" : "p";
  return (
    <Tag htmlFor={htmlFor} className="text-table font-medium text-text-primary">
      {children}
      {required ? (
        <span className="ml-[4px] text-danger" aria-hidden>
          *
        </span>
      ) : null}
    </Tag>
  );
}

function Help({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <p id={id} className="mt-[6px] text-caption text-text-secondary">
      {children}
    </p>
  );
}

function FieldError({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <p id={id} className="mt-[6px] flex items-center gap-[6px] text-caption text-danger">
      <CircleAlert size={14} strokeWidth={1.5} aria-hidden />
      {children}
    </p>
  );
}

type Nav = Pick<WizardFrameProps, "step" | "reachable" | "onStep">;

/** 1-qadam — Kompaniya: nom, logotip, asosiy til, valyuta; oʻngda sidebar koʻrinishi. Avtomatik saqlanadi. */
export function CompanyStep({ status, nav, onDone }: { status: SetupStatus; nav: Nav; onDone: () => void }) {
  const t = useTranslations("setup");
  const tc = useTranslations("setup.company");
  const save = useSaveCompany();
  const upload = useUploadLogo();
  const remove = useRemoveLogo();
  const company = status.company;
  const [name, setName] = useState(company?.name ?? "");
  const [locale, setLocale] = useState<Locale>(
    (LOCALES as readonly string[]).includes(company?.defaultLocale ?? "") ? (company!.defaultLocale as Locale) : "uz-Latn",
  );
  const [nameError, setNameError] = useState<string>();
  const [logoError, setLogoError] = useState<string>();
  const [dragging, setDragging] = useState(false);
  const [savedOnce, setSavedOnce] = useState(Boolean(company));
  const nameRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const err = describeError(save.error ?? upload.error ?? remove.error);
  const busy = save.isPending || upload.isPending || remove.isPending;
  const logo = logoUrl(company);

  async function persist(next: { name?: string; locale?: Locale } = {}): Promise<boolean> {
    const n = (next.name ?? name).trim();
    const l = next.locale ?? locale;
    if (!n) return false;
    if (company && company.name === n && company.defaultLocale === l) return true;
    try {
      await save.mutateAsync({ name: n, defaultLocale: l });
      setSavedOnce(true);
      return true;
    } catch {
      return false;
    }
  }

  function requireName(): boolean {
    if (name.trim()) return true;
    setNameError(tc("required"));
    nameRef.current?.focus();
    return false;
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    const problem = logoProblem(file);
    if (problem) {
      setLogoError(tc(problem));
      return;
    }
    setLogoError(undefined);
    if (!requireName()) {
      setLogoError(tc("nameFirst"));
      return;
    }
    if (!(await persist())) return;
    upload.mutate(file, { onSuccess: () => setSavedOnce(true) });
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    void onFile(e.dataTransfer.files[0]);
  }

  async function next() {
    if (!requireName()) return;
    if (await persist()) onDone();
  }

  const saving = save.isPending || upload.isPending || remove.isPending;
  const statusText = saving ? t("saving") : savedOnce ? t("saved") : null;

  return (
    <WizardFrame
      {...nav}
      status={statusText}
      onNext={next}
      nextLoading={save.isPending}
      aside={
        <div className="rounded-modal border border-border bg-surface p-[16px]">
          <p className="text-table font-semibold">{tc("previewTitle")}</p>
          <div className="mt-[12px] rounded-card bg-brand-900 p-[12px]" aria-hidden>
            <div className="flex items-center gap-[8px] pb-[12px]">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element -- server logotipi (PNG/SVG), optimallashtirish kerak emas
                <img src={logo} alt="" className="size-[24px] rounded-control bg-white object-contain" />
              ) : (
                <span className="flex size-[24px] items-center justify-center rounded-control bg-primary text-caption font-semibold text-white">
                  M
                </span>
              )}
              <span className={cn("truncate text-table font-medium", name.trim() ? "text-white" : "text-sidebar-text")}>
                {name.trim() || tc("previewPlaceholder")}
              </span>
            </div>
            <div className="flex flex-col gap-[6px] border-t border-white/10 pt-[6px]">
              {[72, 96, 64].map((w, i) => (
                <div key={w} className={cn("flex items-center gap-[10px] rounded-control px-[6px] py-[7px]", i === 0 && "bg-white/10")}>
                  <span className={cn("size-[8px] rounded-sm", i === 0 ? "bg-sidebar-active" : "bg-white/20")} />
                  <span className={cn("h-[4px] rounded-full", i === 0 ? "bg-sidebar-text" : "bg-white/20")} style={{ width: w }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      }
    >
      <div className="rounded-modal border border-border bg-surface p-[28px]">
        <div className="flex flex-col">
          <Label htmlFor="setup-company-name" required>
            {tc("name")}
          </Label>
          <input
            id="setup-company-name"
            ref={nameRef}
            autoFocus
            value={name}
            maxLength={200}
            placeholder={tc("namePlaceholder")}
            aria-invalid={nameError ? true : undefined}
            aria-describedby="setup-company-name-help"
            onChange={(e) => {
              setName(e.target.value);
              if (nameError && e.target.value.trim()) setNameError(undefined);
            }}
            onBlur={() => void persist()}
            className={cn(
              "mt-[6px] h-[44px] w-full rounded-card border bg-surface px-[14px] text-body outline-none placeholder:text-text-disabled",
              "transition-[border-color,box-shadow] duration-150 ease-out",
              nameError
                ? "border-danger"
                : "border-border hover:border-text-disabled focus:border-primary focus:shadow-[0_0_0_3px_var(--color-primary-soft)]",
            )}
          />
          {nameError ? (
            <FieldError id="setup-company-name-help">{nameError}</FieldError>
          ) : (
            <Help id="setup-company-name-help">{tc("nameHelp")}</Help>
          )}
        </div>

        <div className="mt-[28px] flex flex-col">
          <Label>{tc("logo")}</Label>
          {logo ? (
            <div className="mt-[6px] flex items-center gap-[16px] rounded-card border border-border p-[16px]">
              {/* eslint-disable-next-line @next/next/no-img-element -- server logotipi */}
              <img src={logo} alt={tc("logo")} className="size-[64px] rounded-card border border-border object-contain" />
              <div className="flex flex-1 flex-wrap justify-end gap-[8px]">
                <Button variant="secondary" disabled={busy} onClick={() => fileRef.current?.click()}>
                  {tc("replace")}
                </Button>
                <Button variant="tertiary" disabled={busy} loading={remove.isPending} onClick={() => remove.mutate()}>
                  {tc("remove")}
                </Button>
              </div>
            </div>
          ) : (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cn(
                "mt-[6px] flex min-h-[112px] flex-col items-center justify-center gap-[4px] rounded-card border border-dashed px-[16px] py-[20px] text-center transition-colors duration-150 ease-out",
                dragging ? "border-primary bg-primary-soft" : "border-border",
              )}
            >
              {upload.isPending ? (
                <span className="flex items-center gap-[8px] text-table text-text-secondary">
                  <Spinner />
                  {tc("uploading")}
                </span>
              ) : (
                <>
                  <p className="text-table">
                    {tc("drop1")}
                    <button type="button" className="text-primary-button hover:underline" onClick={() => fileRef.current?.click()}>
                      {tc("drop2")}
                    </button>
                  </p>
                  <p className="text-caption text-text-secondary">{tc("dropHelp")}</p>
                </>
              )}
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/svg+xml,.png,.svg"
            className="hidden"
            aria-label={tc("logo")}
            onChange={(e) => {
              void onFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          {logoError ? <FieldError>{logoError}</FieldError> : null}
        </div>

        <fieldset className="mt-[28px] flex flex-col">
          <legend className="text-table font-medium text-text-primary">
            {tc("lang")}
            <span className="ml-[4px] text-danger" aria-hidden>
              *
            </span>
          </legend>
          <div role="radiogroup" aria-label={tc("lang")} className="mt-[6px] grid grid-cols-1 gap-[12px] sm:grid-cols-3">
            {LOCALES.map((l) => {
              const active = l === locale;
              return (
                <button
                  key={l}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => {
                    setLocale(l);
                    void persist({ locale: l });
                  }}
                  className={cn(
                    "relative flex flex-col items-start rounded-card border px-[14px] py-[14px] text-left transition-colors duration-150 ease-out",
                    active ? "border-primary bg-primary-soft" : "border-border hover:border-text-disabled",
                  )}
                >
                  <span className="text-body text-text-primary">{LANG_CARDS[l].name}</span>
                  <span className="mt-[2px] text-caption text-text-secondary">{LANG_CARDS[l].sample}</span>
                  {active ? <span aria-hidden className="absolute top-[10px] right-[10px] size-[18px] rounded-full bg-primary" /> : null}
                </button>
              );
            })}
          </div>
          <Help>{tc("langHelp")}</Help>
        </fieldset>

        <div className="mt-[28px] flex flex-col">
          <Label htmlFor="setup-currency">{tc("currency")}</Label>
          <input
            id="setup-currency"
            disabled
            value={tc("currencyValue")}
            className="mt-[6px] h-[44px] w-full cursor-not-allowed rounded-card border border-border bg-table-header px-[14px] text-body text-text-secondary"
          />
          <Help>{tc("currencyHelp")}</Help>
        </div>

        {err.message ? <Alert tone="danger" title={err.message} className="mt-[24px]" /> : null}
      </div>
    </WizardFrame>
  );
}
