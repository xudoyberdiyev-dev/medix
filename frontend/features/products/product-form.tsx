"use client";

import { Check, CircleAlert, Info, Lock, RefreshCw, ScanBarcode, TriangleAlert, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { ErrorState, Skeleton } from "@/components/ui/system-states";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { useDictionary, useSaveEntry, type Entry } from "@/features/dictionaries/api";
import { describeError } from "@/features/setup/form-error";
import { cn } from "@/lib/cn";
import { DOSAGE_FORMS, fetchNewCode, useDuplicates, useEmployeeOptions, useProduct, useSaveProduct, type ProductDetail } from "./api";
import {
  EMPTY_PAGE_FORM,
  copyForm,
  eanCheck,
  pageFormFromProduct,
  sameForm,
  toPageRequest,
  validatePageForm,
  type EanError,
  type PageForm,
} from "./form-model";

/** Faol yozuvlar + hozir tanlangan (nofaol boʻlsa ham). */
function options(list: Entry[] | undefined, selected: string | null) {
  return (list ?? []).filter((e) => e.active || String(e.id) === selected).map((e) => ({ value: String(e.id), label: e.name }));
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const h = setTimeout(() => setV(value), ms);
    return () => clearTimeout(h);
  }, [value, ms]);
  return v;
}

/**
 * Mahsulot shakli — toʻliq sahifa (prototip `Products` → `isForm`): `/products/new` (`?copy=<id>`) va `/products/<id>/edit`.
 */
export function ProductFormPage({ id = null, copyFrom = null }: { id?: number | null; copyFrom?: number | null }) {
  const t = useTranslations("products.pageForm");
  const loadId = id ?? copyFrom;
  const product = useProduct(loadId);
  const [code, setCode] = useState<string | null>(null);
  useEffect(() => {
    if (id !== null) return;
    let alive = true;
    fetchNewCode()
      .then((c) => alive && setCode(c))
      .catch(() => alive && setCode(""));
    return () => {
      alive = false;
    };
  }, [id]);
  if (loadId !== null && product.error) return <ErrorState onRetry={() => product.refetch()} />;
  if ((loadId !== null && !product.data) || (id === null && code === null)) {
    return (
      <div className="mx-auto flex w-full max-w-[880px] flex-col gap-4" aria-busy>
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  const p = product.data ?? null;
  const initial =
    id !== null && p
      ? pageFormFromProduct(p)
      : copyFrom !== null && p
        ? { ...copyForm(p, t("copySuffix")), code: code ?? "" }
        : { ...EMPTY_PAGE_FORM, code: code ?? "" };
  return <FormBody key={`${loadId}-${id}`} product={id !== null ? p : null} initial={initial} />;
}

type ErrKey = keyof PageForm;

function FormBody({ product, initial }: { product: ProductDetail | null; initial: PageForm }) {
  const t = useTranslations("products.pageForm");
  const tf = useTranslations("products.dosageForm");
  const router = useRouter();
  const me = useMe();
  const [f, setF] = useState<PageForm>(initial);
  const [base, setBase] = useState<PageForm>(initial);
  const [tried, setTried] = useState(false);
  const [bcInput, setBcInput] = useState("");
  const [bcErr, setBcErr] = useState<EanError | "have" | null>(null);
  const [leave, setLeave] = useState<(() => void) | null>(null);
  const [mk, setMk] = useState<{ name: string; error?: string } | null>(null);
  const top = useRef<HTMLDivElement>(null);
  const save = useSaveProduct();
  const saveMaker = useSaveEntry("MANUFACTURER");
  const makers = useDictionary("MANUFACTURER");
  const cats = useDictionary("CATEGORY");
  const countries = useDictionary("COUNTRY");
  const units = useDictionary("UNIT");
  const employees = useEmployeeOptions();
  const editId = product?.id ?? null;
  const locked = !!product?.hasMovements;
  const dirty = !sameForm(f, base);
  const set =
    <K extends keyof PageForm>(k: K) =>
    (v: PageForm[K]) =>
      setF((s) => ({ ...s, [k]: v }));

  // Birlik tanlanmagan boʻlsa — «dona» (yoki birinchi faol)
  const defUnit = units.data?.find((x) => x.active && x.shortName === "dona") ?? units.data?.find((x) => x.active);
  const unitId = f.unitId ?? (defUnit ? String(defUnit.id) : null);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const dupQuery = useDebounced(
    { name: f.name, manufacturerId: f.manufacturerId, code: f.code, barcodes: f.barcodes, excludeId: editId },
    300,
  );
  const dups = useDuplicates(dupQuery, true).data;
  const serverErr = describeError(save.error);
  const local = tried ? validatePageForm({ ...f, unitId }) : {};
  const errText = (k: ErrKey): string | undefined => {
    const e = local[k];
    if (e) return t(`errors.${e}`);
    return serverErr.fields[k];
  };
  const missing = (Object.keys(local) as ErrKey[]).filter((k) => k !== "unitId");
  const sameName = dups?.sameName ?? null;
  const codeOwner = dups?.codeOwner ?? null;
  const bcOwner = dups?.barcodes[0] ?? null;

  const guard = (fn: () => void) => (dirty ? setLeave(() => fn) : fn());
  const back = () => guard(() => router.push(product ? `/products/${product.id}` : "/products"));
  const openOther = (oid: number) => guard(() => router.push(`/products/${oid}`));

  const focusField = (k: string) => {
    const el = top.current?.querySelector<HTMLElement>(`[data-f="${k}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.querySelector<HTMLElement>("input,button,textarea")?.focus({ preventScroll: true });
  };

  const addBc = (): boolean => {
    const v = bcInput.trim();
    if (!v) return true;
    const e = eanCheck(v);
    if (e) return (setBcErr(e), false);
    if (f.barcodes.includes(v)) return (setBcErr("have"), false);
    setF((s) => ({ ...s, barcodes: [...s.barcodes, v] }));
    setBcInput("");
    setBcErr(null);
    return true;
  };

  const submit = () => {
    setTried(true);
    const pending = bcInput.trim();
    if (pending && !addBc()) return setTimeout(() => focusField("barcodes"), 0);
    const form = { ...f, unitId, barcodes: pending ? [...f.barcodes, pending] : f.barcodes };
    const e = Object.keys(validatePageForm(form));
    if (e.length) return setTimeout(() => focusField(e[0]), 0);
    if (sameName) return top.current?.scrollIntoView({ behavior: "smooth" });
    if (codeOwner) return setTimeout(() => focusField("code"), 0);
    if (bcOwner) return setTimeout(() => focusField("barcodes"), 0);
    save.mutate(
      { id: editId ?? undefined, body: toPageRequest(form) },
      {
        onSuccess: (p) => {
          setBase(form);
          setF(form);
          const codeChanged = product !== null && p.code !== product.code;
          toast({ tone: "success", title: codeChanged ? t("codeChanged") : t("saved"), description: `${p.code} · ${p.name}` });
          router.push(`/products/${p.id}`);
        },
      },
    );
  };

  const vatOpts: [string, string][] = [
    ["12", "12%"],
    ["0", "0%"],
    ["none", t("vatNone")],
  ];
  if (!vatOpts.some(([v]) => v === f.vat)) vatOpts.splice(1, 0, [f.vat, `${f.vat}%`]);
  const supply = useMemo(
    () => [{ value: "", label: "—" }, ...(employees.data ?? []).map((e) => ({ value: String(e.id), label: e.fullName }))],
    [employees.data],
  );
  const canMaker = can(me.data, "lookups.makers");
  const codeErr = codeOwner ? t("errors.codeDup") : errText("code");
  const bcErrText = bcErr ? (bcErr === "len" ? t("bc.len", { n: bcInput.trim().length }) : t(`bc.${bcErr}`)) : undefined;

  return (
    <div className="flex min-w-0 flex-col items-center" data-screen-label="Mahsulot formasi">
      <div ref={top} className="flex w-full max-w-[880px] flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <nav className="flex items-center gap-1.5 text-caption">
            <button type="button" onClick={() => guard(() => router.push("/products"))} className="text-primary-button hover:underline">
              {t("crumbParent")}
            </button>
            <span className="text-text-secondary">/</span>
            <span className="text-text-secondary">{product ? t("crumbEdit") : t("new")}</span>
          </nav>
          <h1 className="text-[22px] leading-7 font-semibold tracking-[-0.01em]">{product ? product.name : t("new")}</h1>
        </div>

        {missing.length > 0 ? (
          <Banner tone="danger" icon={CircleAlert}>
            <span className="font-medium">{t("errN", { n: missing.length })}</span>
            <span className="flex flex-wrap gap-x-3 gap-y-1">
              {missing.map((k) => (
                <button key={k} type="button" onClick={() => focusField(k)} className="underline underline-offset-2">
                  {t(`fields.${k}`)}
                </button>
              ))}
            </span>
          </Banner>
        ) : null}
        {sameName && missing.length === 0 ? (
          <Banner tone="warning" icon={TriangleAlert}>
            <span>
              {t("dup", {
                name: sameName.name,
                maker: options(makers.data, f.manufacturerId).find((o) => o.value === f.manufacturerId)?.label ?? "",
              })}
            </span>
            <button type="button" onClick={() => openOther(sameName.id)} className="self-start font-medium underline underline-offset-2">
              {t("dupOpen")}
            </button>
          </Banner>
        ) : null}
        {serverErr.message ? (
          <Banner tone="danger" icon={CircleAlert}>
            <span>{serverErr.message}</span>
          </Banner>
        ) : null}

        <Section title={t("sec.basic")} description={t("sec.basicD")}>
          <div className="grid grid-cols-2 gap-4">
            <div data-f="name" className="col-span-2">
              <TextField
                label={t("fields.name")}
                required
                value={f.name}
                onChange={set("name")}
                error={errText("name")}
                placeholder="Omeprazol 20mg"
                maxLength={300}
              />
            </div>
            <div data-f="contractName" className="col-span-2">
              <TextField
                label={t("fields.contractName")}
                required
                value={f.contractName}
                onChange={set("contractName")}
                hint={t("contractHint")}
                error={errText("contractName")}
                placeholder="Омепразол капсулы 20 мг №28"
                maxLength={300}
              />
            </div>
            <div data-f="classifierName">
              <TextField
                label={t("fields.classifierName")}
                required
                value={f.classifierName}
                onChange={set("classifierName")}
                error={errText("classifierName")}
                placeholder="Omeprazol"
                maxLength={500}
              />
            </div>
            <div data-f="manufacturerId">
              <Select
                label={t("fields.manufacturerId")}
                required
                searchable
                placeholder={t("choose")}
                options={options(makers.data, f.manufacturerId)}
                value={f.manufacturerId}
                onChange={set("manufacturerId")}
                error={errText("manufacturerId")}
                footer={canMaker ? { label: t("newMaker"), onSelect: () => setMk({ name: "" }) } : undefined}
              />
            </div>
            <div data-f="categoryId">
              <Select
                label={t("fields.categoryId")}
                required
                searchable
                placeholder={t("choose")}
                options={options(cats.data, f.categoryId)}
                value={f.categoryId}
                onChange={set("categoryId")}
                error={errText("categoryId")}
              />
            </div>
            <Select
              label={t("fields.supplyEmployeeId")}
              searchable
              placeholder={t("choose")}
              options={supply}
              value={f.supplyEmployeeId ?? ""}
              onChange={(v) => set("supplyEmployeeId")(v || null)}
            />
            <Select
              label={t("fields.dosageForm")}
              placeholder={t("choose")}
              options={DOSAGE_FORMS.map((k) => ({ value: k, label: tf(k) }))}
              value={f.dosageForm}
              onChange={(v) => set("dosageForm")((v as PageForm["dosageForm"]) ?? null)}
            />
            <Select
              label={t("fields.countryId")}
              searchable
              placeholder={t("choose")}
              options={options(countries.data, f.countryId)}
              value={f.countryId}
              onChange={set("countryId")}
            />
            <TextField label={t("fields.dose")} value={f.dose} onChange={set("dose")} placeholder="20 mg" maxLength={50} />
            <TextField
              label={t("fields.packQty")}
              value={f.packQty}
              onChange={(v) => set("packQty")(v.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              placeholder="28"
            />
            <div data-f="minQty">
              <TextField
                label={t("fields.minQty")}
                value={f.minQty}
                onChange={(v) => set("minQty")(v.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                placeholder="10"
                hint={t("mmHelp")}
              />
            </div>
            <div data-f="maxQty">
              <TextField
                label={t("fields.maxQty")}
                value={f.maxQty}
                onChange={(v) => set("maxQty")(v.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                placeholder="300"
                error={errText("maxQty")}
              />
            </div>
          </div>
        </Section>

        <Section title={t("sec.id")} description={t("sec.idD")}>
          <div className="grid grid-cols-2 gap-4">
            <div data-f="code" className="col-span-2 flex flex-col">
              <label htmlFor="pf-code" className="mb-1 font-medium text-text-secondary">
                {t("fields.code")}{" "}
                <span className="ml-0.5 text-danger" aria-hidden>
                  *
                </span>
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  id="pf-code"
                  value={f.code}
                  onChange={(e) => set("code")(e.target.value.replace(/\D/g, "").slice(0, 8))}
                  inputMode="numeric"
                  maxLength={8}
                  placeholder="48203315"
                  aria-invalid={!!codeErr || undefined}
                  className={cn(
                    "h-[34px] w-40 rounded-control border bg-surface px-3 font-mono text-body tracking-[0.04em] outline-none focus:border-primary-button focus:ring-3 focus:ring-primary/15",
                    codeErr ? "border-danger" : "border-border",
                  )}
                />
                <Button variant="secondary" icon={RefreshCw} onClick={() => fetchNewCode().then((c) => set("code")(c))}>
                  {t("genCode")}
                </Button>
                <span className="text-caption text-text-secondary">{t("codeHelp")}</span>
              </div>
              {codeErr ? (
                <FieldError>
                  {codeErr}
                  {codeOwner ? (
                    <button type="button" onClick={() => openOther(codeOwner.id)} className="font-medium underline underline-offset-2">
                      {codeOwner.name}
                    </button>
                  ) : null}
                </FieldError>
              ) : null}
            </div>
            <div data-f="barcodes" className="col-span-2 flex flex-col">
              <label htmlFor="pf-bc" className="mb-1 font-medium text-text-secondary">
                {t("fields.barcodes")}
              </label>
              <div
                className={cn(
                  "flex min-h-[34px] flex-wrap items-center gap-1.5 rounded-control border bg-surface px-1.5 py-1",
                  bcErr || bcOwner ? "border-danger" : "border-border",
                )}
              >
                {f.barcodes.map((b) => (
                  <span
                    key={b}
                    className="inline-flex h-6 items-center gap-1 rounded-control border border-border bg-background pr-1 pl-2 font-mono text-[12.5px]"
                  >
                    {b}
                    <button
                      type="button"
                      aria-label={t("bc.remove", { code: b })}
                      onClick={() => set("barcodes")(f.barcodes.filter((x) => x !== b))}
                      className="flex size-[18px] items-center justify-center rounded-sm text-text-secondary hover:bg-border"
                    >
                      <X size={12} strokeWidth={1.5} aria-hidden />
                    </button>
                  </span>
                ))}
                <input
                  id="pf-bc"
                  value={bcInput}
                  onChange={(e) => (setBcInput(e.target.value.replace(/\s/g, "").slice(0, 14)), setBcErr(null))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addBc();
                    } else if (e.key === "Backspace" && !bcInput && f.barcodes.length) {
                      set("barcodes")(f.barcodes.slice(0, -1));
                    }
                  }}
                  onBlur={() => bcInput.trim() && addBc()}
                  inputMode="numeric"
                  placeholder={t("bc.placeholder")}
                  className="h-6 min-w-[200px] flex-1 bg-transparent font-mono text-[12.5px] outline-none placeholder:text-text-disabled"
                />
              </div>
              {bcErrText ? <FieldError>{bcErrText}</FieldError> : null}
              {bcOwner ? (
                <FieldError>
                  {t("bc.dup", { code: bcOwner.barcode })}
                  <button type="button" onClick={() => openOther(bcOwner.product.id)} className="font-medium underline underline-offset-2">
                    {bcOwner.product.name}
                  </button>
                </FieldError>
              ) : null}
            </div>
            <div data-f="ikpu">
              <TextField
                label={t("fields.ikpu")}
                required
                value={f.ikpu}
                onChange={(v) => set("ikpu")(v.replace(/\D/g, "").slice(0, 17))}
                inputMode="numeric"
                error={errText("ikpu")}
                placeholder="03004001001000000"
                className="font-mono"
              />
            </div>
            <div data-f="farmId">
              <TextField
                label={t("fields.farmId")}
                required
                value={f.farmId}
                onChange={set("farmId")}
                error={errText("farmId")}
                placeholder="FRM-0001234"
                maxLength={50}
                className="font-mono"
              />
            </div>
          </div>
        </Section>

        <Section title={t("sec.units")} description={t("sec.unitsD")}>
          <div className="grid grid-cols-2 gap-4">
            <div data-f="unitId" title={locked ? t("lockedTip") : undefined}>
              <Select
                label={t("fields.unitId")}
                options={options(units.data, unitId)}
                value={unitId}
                onChange={set("unitId")}
                disabled={locked}
                error={errText("unitId")}
              />
            </div>
            <div title={locked ? t("lockedTip") : undefined} className="relative">
              <TextField
                label={t("fields.perPack")}
                value={f.perPack}
                onChange={(v) => set("perPack")(v.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                disabled={locked}
              />
              {locked ? (
                <span className="pointer-events-none absolute right-2.5 bottom-2.5 flex text-text-secondary">
                  <Lock size={14} strokeWidth={1.5} aria-hidden />
                </span>
              ) : null}
            </div>
          </div>
        </Section>

        <Section title={t("sec.storage")} description={t("sec.storageD")}>
          <div className="flex flex-col">
            <Toggle
              label={t("fields.controlled")}
              help={t("ctrlHelp")}
              on={f.controlled}
              locked={locked}
              lockTip={t("lockedTip")}
              onToggle={() => set("controlled")(!f.controlled)}
              extra={
                f.controlled ? (
                  <div className="flex gap-2.5 rounded-control border border-danger/30 bg-danger-bg px-3 py-2.5 text-danger">
                    <Icon icon={Lock} className="mt-px" />
                    <span>{t("ctrlInfo")}</span>
                  </div>
                ) : null
              }
            />
            <Toggle
              label={t("fields.marked")}
              help={t("markHelp")}
              on={f.marked}
              locked={locked}
              lockTip={t("lockedTip")}
              onToggle={() => set("marked")(!f.marked)}
              extra={
                f.marked ? (
                  <div className="flex gap-2.5 rounded-control border border-border bg-table-header px-3 py-2.5">
                    <Icon icon={ScanBarcode} className="mt-px text-text-secondary" />
                    <span>{t("markInfo")}</span>
                  </div>
                ) : null
              }
            />
            <Toggle
              label={t("fields.prescription")}
              help={t("rxHelp")}
              on={f.prescription}
              last
              onToggle={() => set("prescription")(!f.prescription)}
            />
          </div>
        </Section>

        <Section title={t("sec.tax")} description={t("sec.taxD")}>
          <div className="flex flex-col gap-1.5">
            <span className="font-medium text-text-secondary">{t("fields.vat")}</span>
            <div
              role="radiogroup"
              aria-label={t("fields.vat")}
              className="inline-flex h-[34px] gap-0.5 self-start rounded-control bg-border/60 p-0.5"
            >
              {vatOpts.map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={f.vat === v}
                  onClick={() => set("vat")(v)}
                  className={cn(
                    "h-[30px] rounded-control px-3.5 font-medium transition-colors duration-150",
                    f.vat === v ? "bg-surface text-text-primary shadow-xs" : "text-text-secondary",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </Section>

        <Section title={t("sec.note")} description={t("sec.noteD")}>
          <div className="flex flex-col">
            <label htmlFor="pf-note" className="mb-1 font-medium text-text-secondary">
              {t("fields.note")}
            </label>
            <textarea
              id="pf-note"
              rows={3}
              value={f.note}
              maxLength={1000}
              onChange={(e) => set("note")(e.target.value)}
              placeholder={t("notePh")}
              className="resize-y rounded-control border border-border bg-surface px-3 py-2 outline-none placeholder:text-text-disabled focus:border-primary-button focus:ring-3 focus:ring-primary/15"
            />
          </div>
        </Section>

        <Banner tone="info" icon={Info}>
          <span>{t("priceInfo")}</span>
        </Banner>
        <div className="h-6" />
      </div>

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
            <Button icon={Check} loading={save.isPending} onClick={submit}>
              {t("save")}
            </Button>
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
              setBase(f);
              setTimeout(fn, 0);
            },
          }}
          secondaryAction={{ label: t("stay"), onClick: () => setLeave(null) }}
        >
          <p>{t("leaveD")}</p>
        </Modal>
      ) : null}
      {mk ? (
        <Modal
          open
          size="sm"
          title={t("newMaker")}
          onClose={() => setMk(null)}
          primaryAction={{
            label: t("mkAdd"),
            loading: saveMaker.isPending,
            onClick: () => {
              const n = mk.name.trim();
              if (!n) return setMk({ ...mk, error: t("errors.required") });
              const dup = (makers.data ?? []).find((m) => m.name.toLocaleLowerCase("uz") === n.toLocaleLowerCase("uz"));
              if (dup) return setMk({ ...mk, error: t("mkDup", { name: dup.name }) });
              saveMaker.mutate(
                { name: n },
                {
                  onSuccess: (e) => {
                    setMk(null);
                    set("manufacturerId")(String(e.id));
                    toast({ tone: "success", title: t("mkAdded", { name: e.name }) });
                  },
                  onError: (err) => setMk({ ...mk, error: describeError(err).message ?? undefined }),
                },
              );
            },
          }}
          secondaryAction={{ label: t("cancel"), onClick: () => setMk(null) }}
        >
          <div className="flex flex-col gap-3">
            <p className="text-text-secondary">{t("mkText")}</p>
            <TextField
              label={t("mkName")}
              value={mk.name}
              onChange={(v) => setMk({ name: v })}
              error={mk.error}
              autoFocus
              maxLength={200}
            />
          </div>
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

function FieldError({ children }: { children: ReactNode }) {
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-caption text-danger">
      <CircleAlert size={14} strokeWidth={1.5} aria-hidden />
      {children}
    </div>
  );
}

function Toggle({
  label,
  help,
  on,
  locked = false,
  lockTip,
  last = false,
  onToggle,
  extra,
}: {
  label: string;
  help: string;
  on: boolean;
  locked?: boolean;
  lockTip?: string;
  last?: boolean;
  onToggle: () => void;
  extra?: ReactNode;
}) {
  return (
    <div title={locked ? lockTip : undefined} className={cn("flex flex-col gap-3 py-3", !last && "border-b border-border")}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col">
          <span className="flex items-center gap-1.5 font-medium">
            {label}
            {locked ? <Lock size={12} strokeWidth={1.5} aria-hidden className="text-text-secondary" /> : null}
          </span>
          <span className="text-caption text-text-secondary">{help}</span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={label}
          disabled={locked}
          onClick={onToggle}
          className={cn(
            "flex h-5 w-9 flex-none rounded-full p-0.5 transition-colors duration-150",
            on ? "justify-end bg-primary-button" : "justify-start bg-text-secondary",
            locked ? "cursor-not-allowed opacity-55" : "cursor-pointer",
          )}
        >
          <span className="size-4 rounded-full bg-white shadow-xs" />
        </button>
      </div>
      {extra}
    </div>
  );
}
