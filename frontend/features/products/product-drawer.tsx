"use client";

import { CircleCheck, CirclePause, Hash, Power, PowerOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/selection-controls";
import { ErrorState, Skeleton } from "@/components/ui/system-states";
import { Badge } from "@/components/ui/badge";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { useDictionary, type Entry } from "@/features/dictionaries/api";
import { DeactivateDialog } from "@/features/organization/deactivate-dialog";
import { describeError } from "@/features/setup/form-error";
import { formatDateTime } from "@/lib/format";
import {
  DOSAGE_FORMS,
  EMPTY_FORM,
  formFromProduct,
  toRequest,
  useActivateProduct,
  useChangeCode,
  useDeactivateProduct,
  useEmployeeOptions,
  useProduct,
  useSaveProduct,
  type DosageForm,
  type ProductDetail,
  type ProductForm,
  type ProductFormError,
} from "./api";

/** Faol yozuvlar + hozir tanlangan (nofaol boʻlsa ham) — tahrirlashda qiymat yoʻqolmasin. */
function options(list: Entry[] | undefined, selected: string | null) {
  return (list ?? [])
    .filter((e) => e.active || String(e.id) === selected)
    .map((e) => ({ value: String(e.id), label: e.name, sub: e.shortName ?? undefined }));
}

export function ProductDrawer({
  productId,
  copyFrom = null,
  canEdit,
  onClose,
  onCreated,
}: {
  productId: number | null;
  /** «Nusxa olish»: yangi mahsulot shu mahsulot maydonlari bilan (shtrix-kodsiz, nomga «(nusxa)»). */
  copyFrom?: number | null;
  canEdit: boolean;
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const t = useTranslations("products.drawer");
  const tc = useTranslations("common");
  const tl = useTranslations("products.list");
  const loadId = productId ?? copyFrom;
  const product = useProduct(loadId);
  const [tab, setTab] = useState("main");
  if (loadId !== null && product.error) {
    return (
      <Drawer open onClose={onClose} size="lg" kind={t("kind")} title={t("kind")}>
        <ErrorState onRetry={() => product.refetch()} />
      </Drawer>
    );
  }
  if (loadId !== null && !product.data) {
    return (
      <Drawer open onClose={onClose} size="lg" kind={t("kind")} title={tc("loading")}>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-2/3" />
        </div>
      </Drawer>
    );
  }
  const p = productId !== null ? (product.data ?? null) : null;
  const copy = productId === null && copyFrom !== null && product.data ? product.data : null;
  return (
    <ProductEditor
      key={p ? `${p.id}-${p.code}-${p.active}` : copy ? `copy-${copy.id}` : "new"}
      product={p}
      initial={copy ? { ...formFromProduct(copy), name: copy.name + tl("copySuffix"), barcodes: "" } : undefined}
      canEdit={canEdit}
      tab={tab}
      onTab={setTab}
      onClose={onClose}
      onCreated={onCreated}
    />
  );
}

function ProductEditor({
  product,
  initial,
  canEdit,
  tab,
  onTab,
  onClose,
  onCreated,
}: {
  product: ProductDetail | null;
  initial?: ProductForm;
  canEdit: boolean;
  tab: string;
  onTab: (t: string) => void;
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const t = useTranslations("products.drawer");
  const tf = useTranslations("products.form");
  const tp = useTranslations("products");
  const save = useSaveProduct();
  const activate = useActivateProduct();
  const deactivate = useDeactivateProduct();
  const manufacturers = useDictionary("MANUFACTURER");
  const categories = useDictionary("CATEGORY");
  const countries = useDictionary("COUNTRY");
  const units = useDictionary("UNIT");
  const employees = useEmployeeOptions();
  const [form, setForm] = useState<ProductForm>(product ? formFromProduct(product) : (initial ?? EMPTY_FORM));
  const [localErrors, setLocalErrors] = useState<Record<string, ProductFormError>>({});
  const [codeOpen, setCodeOpen] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const err = describeError(save.error);
  const fieldError = (k: string) => (localErrors[k] ? tf(`errors.${localErrors[k]}`) : err.fields[k]);
  const set =
    <K extends keyof ProductForm>(k: K) =>
    (v: ProductForm[K]) =>
      setForm((f) => ({ ...f, [k]: v }));
  const readOnly = !canEdit;

  function submit(e?: FormEvent) {
    e?.preventDefault();
    const { body, errors } = toRequest(form);
    setLocalErrors(errors);
    if (!body) return;
    save.mutate(
      { id: product?.id, body },
      {
        onSuccess: (p) => {
          toast({ tone: "success", title: product ? t("saved") : t("created"), description: `${p.code} · ${p.name}` });
          if (!product) onCreated(p.id);
        },
      },
    );
  }

  const status = product ? (
    product.active ? (
      <Badge tone="success" icon={CircleCheck}>
        {tp("status.ACTIVE")}
      </Badge>
    ) : (
      <Badge tone="neutral" icon={CirclePause}>
        {tp("status.INACTIVE")}
      </Badge>
    )
  ) : undefined;

  return (
    <Drawer
      open
      onClose={onClose}
      size="lg"
      kind={t("kind")}
      title={product ? product.name : t("newTitle")}
      subtitle={product?.code}
      status={status}
      tabs={
        product
          ? {
              items: [
                { key: "main", label: t("tabs.main") },
                { key: "history", label: t("tabs.history"), count: product.codeHistory.length },
              ],
              value: tab,
              onChange: onTab,
            }
          : undefined
      }
      actions={
        canEdit && tab === "main" ? (
          <>
            {product ? (
              <div className="mr-auto flex gap-2">
                <Button variant="tertiary" icon={Hash} onClick={() => setCodeOpen(true)}>
                  {t("changeCode")}
                </Button>
                {product.active ? (
                  <Button variant="tertiary" icon={PowerOff} onClick={() => (deactivate.reset(), setDeactivating(true))}>
                    {t("deactivate")}
                  </Button>
                ) : (
                  <Button
                    variant="tertiary"
                    icon={Power}
                    loading={activate.isPending}
                    onClick={() => activate.mutate(product.id, { onSuccess: () => toast({ tone: "success", title: t("activated") }) })}
                  >
                    {t("activate")}
                  </Button>
                )}
              </div>
            ) : null}
            <Button variant="secondary" onClick={onClose}>
              {t("back")}
            </Button>
            <Button loading={save.isPending} onClick={() => submit()}>
              {t("save")}
            </Button>
          </>
        ) : undefined
      }
    >
      {tab === "history" && product ? (
        product.codeHistory.length === 0 ? (
          <p className="text-text-secondary">{t("noCodeChanges")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {product.codeHistory.map((h) => (
              <li key={`${h.oldCode}-${h.changedAt}`} className="py-3">
                <div className="font-mono">
                  {h.oldCode} → {h.newCode}
                </div>
                <div className="text-caption text-text-secondary">
                  {formatDateTime(new Date(h.changedAt))}
                  {h.changedBy ? ` · ${h.changedBy}` : ""}
                  {h.reason ? ` · ${h.reason}` : ""}
                </div>
              </li>
            ))}
          </ul>
        )
      ) : (
        <form onSubmit={submit} noValidate className="grid grid-cols-2 gap-4">
          <fieldset disabled={readOnly} className="contents">
            <TextField
              label={tf("name")}
              value={form.name}
              onChange={set("name")}
              error={fieldError("name")}
              required
              className="col-span-2"
              autoFocus={!product}
            />
            <TextField
              label={tf("contractName")}
              value={form.contractName}
              onChange={set("contractName")}
              error={fieldError("contractName")}
            />
            <TextField
              label={tf("classifierName")}
              value={form.classifierName}
              onChange={set("classifierName")}
              error={fieldError("classifierName")}
            />
            <Select
              label={tf("manufacturer")}
              searchable
              disabled={readOnly}
              value={form.manufacturerId}
              onChange={set("manufacturerId")}
              error={fieldError("manufacturerId")}
              options={options(manufacturers.data, form.manufacturerId)}
            />
            <Select
              label={tf("country")}
              searchable
              disabled={readOnly}
              value={form.countryId}
              onChange={set("countryId")}
              error={fieldError("countryId")}
              options={options(countries.data, form.countryId)}
            />
            <Select
              label={tf("category")}
              searchable
              disabled={readOnly}
              value={form.categoryId}
              onChange={set("categoryId")}
              error={fieldError("categoryId")}
              options={options(categories.data, form.categoryId)}
            />
            <Select
              label={tf("dosageForm")}
              disabled={readOnly}
              value={form.dosageForm}
              onChange={(v) => set("dosageForm")((DOSAGE_FORMS as string[]).includes(v ?? "") ? (v as DosageForm) : null)}
              options={DOSAGE_FORMS.map((f) => ({ value: f, label: tp(`dosageForm.${f}`) }))}
            />
            <TextField label={tf("dose")} value={form.dose} onChange={set("dose")} error={fieldError("dose")} maxLength={50} />
            <TextField
              label={tf("packQty")}
              value={form.packQty}
              onChange={set("packQty")}
              error={fieldError("packQty")}
              inputMode="numeric"
            />
            <TextField
              label={tf("perPack")}
              value={form.perPack}
              onChange={set("perPack")}
              error={fieldError("perPack")}
              inputMode="numeric"
            />
            <Select
              label={tf("unit")}
              required
              disabled={readOnly}
              value={form.unitId}
              onChange={set("unitId")}
              error={fieldError("unitId")}
              options={options(units.data, form.unitId)}
            />
            <Select
              label={tf("supplyEmployee")}
              searchable
              disabled={readOnly}
              value={form.supplyEmployeeId}
              onChange={set("supplyEmployeeId")}
              error={fieldError("supplyEmployeeId")}
              hint={tf("supplyEmployeeHint")}
              options={(employees.data ?? []).map((e) => ({ value: String(e.id), label: e.fullName, sub: e.roleName }))}
            />
            <TextField
              label={tf("vatRate")}
              value={form.vatRate}
              onChange={set("vatRate")}
              error={fieldError("vatRate")}
              inputMode="decimal"
              required
            />
            <TextField
              label={tf("ikpu")}
              value={form.ikpu}
              onChange={set("ikpu")}
              error={fieldError("ikpu")}
              inputMode="numeric"
              maxLength={17}
              hint={tf("ikpuHint")}
            />
            <TextField label={tf("farmId")} value={form.farmId} onChange={set("farmId")} error={fieldError("farmId")} />
            <TextField
              label={tf("barcodes")}
              value={form.barcodes}
              onChange={set("barcodes")}
              error={fieldError("barcodes") ?? Object.entries(err.fields).find(([k]) => k.startsWith("barcodes"))?.[1]}
              hint={tf("barcodesHint")}
              className="col-span-2"
            />
            <TextField
              label={tf("minQty")}
              value={form.minQty}
              onChange={set("minQty")}
              error={fieldError("minQty")}
              inputMode="numeric"
              hint={tf("minQtyHint")}
            />
            <TextField
              label={tf("maxQty")}
              value={form.maxQty}
              onChange={set("maxQty")}
              error={fieldError("maxQty")}
              inputMode="numeric"
              hint={tf("maxQtyHint")}
            />
            <TextField
              label={tf("note")}
              value={form.note}
              onChange={set("note")}
              error={fieldError("note")}
              maxLength={1000}
              placeholder={tf("notePlaceholder")}
              className="col-span-2"
            />
            <div className="col-span-2 flex flex-wrap gap-6 pt-2">
              <Checkbox
                label={tf("marked")}
                description={tf("markedHint")}
                checked={form.marked}
                disabled={readOnly}
                onChange={set("marked")}
              />
              <Checkbox
                label={tf("controlled")}
                description={tf("controlledHint")}
                checked={form.controlled}
                disabled={readOnly}
                onChange={set("controlled")}
              />
              <Checkbox label={tf("prescription")} checked={form.prescription} disabled={readOnly} onChange={set("prescription")} />
            </div>
          </fieldset>
          {err.message ? <Alert tone="danger" title={err.message} className="col-span-2" /> : null}
        </form>
      )}
      {codeOpen && product ? <ChangeCodeDialog product={product} onClose={() => setCodeOpen(false)} /> : null}
      {deactivating && product ? (
        <DeactivateDialog
          title={t("deactivateTitle", { name: product.name })}
          consequence={t("deactivateConsequence")}
          actionLabel={t("deactivateAction")}
          pending={deactivate.isPending}
          error={deactivate.error}
          onClose={() => setDeactivating(false)}
          onConfirm={(reason) =>
            deactivate.mutate(
              { id: product.id, reason },
              {
                onSuccess: () => (toast({ tone: "success", title: t("deactivated"), description: product.name }), setDeactivating(false)),
              },
            )
          }
        />
      ) : null}
    </Drawer>
  );
}

function ChangeCodeDialog({ product, onClose }: { product: ProductDetail; onClose: () => void }) {
  const t = useTranslations("products.code");
  const change = useChangeCode();
  const [code, setCode] = useState(product.code);
  const [reason, setReason] = useState("");
  const [local, setLocal] = useState<{ code?: string; reason?: string }>({});
  const err = describeError(change.error);
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={t("title")}
      primaryAction={{
        label: t("save"),
        loading: change.isPending,
        onClick: () => {
          const e = {
            code: /^[1-9]\d{7}$/.test(code) ? undefined : t("codeError"),
            reason: reason.trim() ? undefined : t("reasonError"),
          };
          setLocal(e);
          if (e.code || e.reason) return;
          change.mutate(
            { id: product.id, code, reason: reason.trim() },
            {
              onSuccess: (p) => (toast({ tone: "success", title: t("changed"), description: `${product.code} → ${p.code}` }), onClose()),
            },
          );
        },
      }}
    >
      <p className="mb-4 text-text-secondary">{t("intro")}</p>
      <div className="flex flex-col gap-4">
        <TextField
          label={t("newCode")}
          value={code}
          onChange={(v) => setCode(v.replace(/\D/g, "").slice(0, 8))}
          error={local.code ?? err.fields.code}
          inputMode="numeric"
          className="font-mono"
          required
          autoFocus
        />
        <TextField label={t("reason")} value={reason} onChange={setReason} error={local.reason ?? err.fields.reason} required />
        {err.message ? <Alert tone="danger" title={err.message} /> : null}
      </div>
    </Modal>
  );
}
