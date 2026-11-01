"use client";

import { CircleCheck, CirclePause, Hash, Power, PowerOff } from "lucide-react";
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
  EMPTY_FORM,
  formFromProduct,
  toRequest,
  useActivateProduct,
  useChangeCode,
  useDeactivateProduct,
  useEmployeeOptions,
  useProduct,
  useSaveProduct,
  type ProductDetail,
  type ProductForm,
} from "./api";

/** Faol yozuvlar + hozir tanlangan (nofaol boʻlsa ham) — tahrirlashda qiymat yoʻqolmasin. */
function options(list: Entry[] | undefined, selected: string | null) {
  return (list ?? [])
    .filter((e) => e.active || String(e.id) === selected)
    .map((e) => ({ value: String(e.id), label: e.name, sub: e.shortName ?? undefined }));
}

export function ProductDrawer({
  productId,
  canEdit,
  onClose,
  onCreated,
}: {
  productId: number | null;
  canEdit: boolean;
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const product = useProduct(productId);
  const [tab, setTab] = useState("main");
  if (productId !== null && product.error) {
    return (
      <Drawer open onClose={onClose} size="lg" kind="Mahsulot" title="Mahsulot">
        <ErrorState onRetry={() => product.refetch()} />
      </Drawer>
    );
  }
  if (productId !== null && !product.data) {
    return (
      <Drawer open onClose={onClose} size="lg" kind="Mahsulot" title="Yuklanmoqda…">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-2/3" />
        </div>
      </Drawer>
    );
  }
  const p = product.data ?? null;
  return (
    <ProductEditor
      key={p ? `${p.id}-${p.code}-${p.active}` : "new"}
      product={p}
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
  canEdit,
  tab,
  onTab,
  onClose,
  onCreated,
}: {
  product: ProductDetail | null;
  canEdit: boolean;
  tab: string;
  onTab: (t: string) => void;
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const save = useSaveProduct();
  const activate = useActivateProduct();
  const deactivate = useDeactivateProduct();
  const manufacturers = useDictionary("MANUFACTURER");
  const categories = useDictionary("CATEGORY");
  const countries = useDictionary("COUNTRY");
  const units = useDictionary("UNIT");
  const employees = useEmployeeOptions();
  const [form, setForm] = useState<ProductForm>(product ? formFromProduct(product) : EMPTY_FORM);
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const [codeOpen, setCodeOpen] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const err = describeError(save.error);
  const fieldError = (k: string) => localErrors[k] ?? err.fields[k];
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
          toast({ tone: "success", title: product ? "Mahsulot saqlandi" : "Mahsulot qoʻshildi", description: `${p.code} · ${p.name}` });
          if (!product) onCreated(p.id);
        },
      },
    );
  }

  const status = product ? (
    product.active ? (
      <Badge tone="success" icon={CircleCheck}>
        Faol
      </Badge>
    ) : (
      <Badge tone="neutral" icon={CirclePause}>
        Nofaol
      </Badge>
    )
  ) : undefined;

  return (
    <Drawer
      open
      onClose={onClose}
      size="lg"
      kind="Mahsulot"
      title={product ? product.name : "Yangi mahsulot"}
      subtitle={product?.code}
      status={status}
      tabs={
        product
          ? {
              items: [
                { key: "main", label: "Asosiy" },
                { key: "history", label: "Kod tarixi", count: product.codeHistory.length },
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
                  Kodni oʻzgartirish
                </Button>
                {product.active ? (
                  <Button variant="tertiary" icon={PowerOff} onClick={() => (deactivate.reset(), setDeactivating(true))}>
                    Nofaol qilish
                  </Button>
                ) : (
                  <Button
                    variant="tertiary"
                    icon={Power}
                    loading={activate.isPending}
                    onClick={() =>
                      activate.mutate(product.id, { onSuccess: () => toast({ tone: "success", title: "Mahsulot faollashtirildi" }) })
                    }
                  >
                    Faollashtirish
                  </Button>
                )}
              </div>
            ) : null}
            <Button variant="secondary" onClick={onClose}>
              Ortga
            </Button>
            <Button loading={save.isPending} onClick={() => submit()}>
              Mahsulotni saqlash
            </Button>
          </>
        ) : undefined
      }
    >
      {tab === "history" && product ? (
        product.codeHistory.length === 0 ? (
          <p className="text-text-secondary">Kod oʻzgartirilmagan.</p>
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
              label="Nomi"
              value={form.name}
              onChange={set("name")}
              error={fieldError("name")}
              required
              className="col-span-2"
              autoFocus={!product}
            />
            <TextField
              label="Shartnomadagi nomi"
              value={form.contractName}
              onChange={set("contractName")}
              error={fieldError("contractName")}
            />
            <TextField
              label="Klassifikator nomi"
              value={form.classifierName}
              onChange={set("classifierName")}
              error={fieldError("classifierName")}
            />
            <Select
              label="Ishlab chiqaruvchi"
              searchable
              disabled={readOnly}
              value={form.manufacturerId}
              onChange={set("manufacturerId")}
              error={fieldError("manufacturerId")}
              options={options(manufacturers.data, form.manufacturerId)}
            />
            <Select
              label="Davlat"
              searchable
              disabled={readOnly}
              value={form.countryId}
              onChange={set("countryId")}
              error={fieldError("countryId")}
              options={options(countries.data, form.countryId)}
            />
            <Select
              label="Kategoriya"
              searchable
              disabled={readOnly}
              value={form.categoryId}
              onChange={set("categoryId")}
              error={fieldError("categoryId")}
              options={options(categories.data, form.categoryId)}
            />
            <Select
              label="Birlik"
              required
              disabled={readOnly}
              value={form.unitId}
              onChange={set("unitId")}
              error={fieldError("unitId")}
              options={options(units.data, form.unitId)}
            />
            <Select
              label="Taʼminot masʼuli"
              searchable
              disabled={readOnly}
              value={form.supplyEmployeeId}
              onChange={set("supplyEmployeeId")}
              error={fieldError("supplyEmployeeId")}
              hint="«Kim nomiga» — taʼminotchi hisobi uchun"
              options={(employees.data ?? []).map((e) => ({ value: String(e.id), label: e.fullName, sub: e.roleName }))}
            />
            <TextField
              label="QQS, %"
              value={form.vatRate}
              onChange={set("vatRate")}
              error={fieldError("vatRate")}
              inputMode="decimal"
              required
            />
            <TextField
              label="IKPU (MXIK)"
              value={form.ikpu}
              onChange={set("ikpu")}
              error={fieldError("ikpu")}
              inputMode="numeric"
              maxLength={17}
              hint="17 ta raqam"
            />
            <TextField label="Farm ID" value={form.farmId} onChange={set("farmId")} error={fieldError("farmId")} />
            <TextField
              label="Shtrix-kodlar"
              value={form.barcodes}
              onChange={set("barcodes")}
              error={fieldError("barcodes") ?? Object.entries(err.fields).find(([k]) => k.startsWith("barcodes"))?.[1]}
              hint="Bir nechta boʻlsa — vergul yoki boʻsh joy bilan"
              className="col-span-2"
            />
            <TextField
              label="Minimal miqdor"
              value={form.minQty}
              onChange={set("minQty")}
              error={fieldError("minQty")}
              inputMode="numeric"
              hint="Buyurtmada bundan kam boʻlmaydi"
            />
            <TextField
              label="Maksimal miqdor"
              value={form.maxQty}
              onChange={set("maxQty")}
              error={fieldError("maxQty")}
              inputMode="numeric"
              hint="Oshsa — buyurtma tasdiqqa ketadi"
            />
            <div className="col-span-2 flex flex-wrap gap-6 pt-2">
              <Checkbox
                label="Markirovkali"
                description="Sotuvda 2D kod skanerlanadi"
                checked={form.marked}
                disabled={readOnly}
                onChange={set("marked")}
              />
              <Checkbox
                label="Nazoratdagi"
                description="Faqat Seyf va litsenziyali mijoz"
                checked={form.controlled}
                disabled={readOnly}
                onChange={set("controlled")}
              />
              <Checkbox label="Retsept bilan" checked={form.prescription} disabled={readOnly} onChange={set("prescription")} />
            </div>
          </fieldset>
          {err.message ? <Alert tone="danger" title={err.message} className="col-span-2" /> : null}
        </form>
      )}
      {codeOpen && product ? <ChangeCodeDialog product={product} onClose={() => setCodeOpen(false)} /> : null}
      {deactivating && product ? (
        <DeactivateDialog
          title={`${product.name}ni nofaol qilasizmi?`}
          consequence="Mahsulot yangi hujjatlarda tanlanmaydi va roʻyxatda standart koʻrinmaydi. Tarixi va qoldiqlari saqlanadi — keyin faollashtirish mumkin."
          actionLabel="Mahsulotni nofaol qilish"
          pending={deactivate.isPending}
          error={deactivate.error}
          onClose={() => setDeactivating(false)}
          onConfirm={(reason) =>
            deactivate.mutate(
              { id: product.id, reason },
              {
                onSuccess: () => (
                  toast({ tone: "success", title: "Mahsulot nofaol qilindi", description: product.name }),
                  setDeactivating(false)
                ),
              },
            )
          }
        />
      ) : null}
    </Drawer>
  );
}

function ChangeCodeDialog({ product, onClose }: { product: ProductDetail; onClose: () => void }) {
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
      title="Mahsulot kodini oʻzgartirish"
      primaryAction={{
        label: "Kodni saqlash",
        loading: change.isPending,
        onClick: () => {
          const e = {
            code: /^[1-9]\d{7}$/.test(code) ? undefined : "Kod — 8 ta raqam, boshida 0 boʻlmaydi.",
            reason: reason.trim() ? undefined : "Sabab kiritilmagan. Nega oʻzgartirilayotganini yozing.",
          };
          setLocal(e);
          if (e.code || e.reason) return;
          change.mutate(
            { id: product.id, code, reason: reason.trim() },
            {
              onSuccess: (p) => (
                toast({ tone: "success", title: "Kod oʻzgartirildi", description: `${product.code} → ${p.code}` }),
                onClose()
              ),
            },
          );
        },
      }}
    >
      <p className="mb-4 text-text-secondary">Eski kod tarixda qoladi va boshqa mahsulotga berilmaydi.</p>
      <div className="flex flex-col gap-4">
        <TextField
          label="Yangi kod"
          value={code}
          onChange={(v) => setCode(v.replace(/\D/g, "").slice(0, 8))}
          error={local.code ?? err.fields.code}
          inputMode="numeric"
          className="font-mono"
          required
          autoFocus
        />
        <TextField label="Sabab" value={reason} onChange={setReason} error={local.reason ?? err.fields.reason} required />
        {err.message ? <Alert tone="danger" title={err.message} /> : null}
      </div>
    </Modal>
  );
}
