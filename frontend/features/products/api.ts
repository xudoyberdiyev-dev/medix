"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ensureCsrf } from "@/features/auth/session";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { toQuery, type ProductFilters } from "./url-state";

export type ProductRow = components["schemas"]["ProductRow"];
export type ProductDetail = components["schemas"]["ProductDetail"];
export type ProductRequest = components["schemas"]["ProductRequest"];
export type EmployeeOption = components["schemas"]["EmployeeOption"];

/** Mahsulot yaratish/oʻzgartirish ruxsati (1.3). */
export const PRODUCT_CREATE = "products.create";

const KEY = ["products"] as const;

export function useProducts(filters: ProductFilters, branchId: number | null) {
  return useQuery({
    queryKey: [...KEY, "list", filters, branchId],
    queryFn: () => unwrap(api.GET("/api/products", { params: { query: toQuery(filters, branchId) } })),
    placeholderData: keepPreviousData,
  });
}

export function useProduct(id: number | null) {
  return useQuery({
    queryKey: [...KEY, "one", id],
    queryFn: () => unwrap(api.GET("/api/products/{id}", { params: { path: { id: id ?? 0 } } })),
    enabled: id !== null,
  });
}

export function useEmployeeOptions() {
  return useQuery({ queryKey: ["employee-lookup"], queryFn: () => unwrap(api.GET("/api/employee-lookup")) });
}

function useProductMutation<T>(fn: (v: T) => Promise<ProductDetail>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: T) => {
      await ensureCsrf();
      return fn(v);
    },
    onSuccess: (p) => {
      qc.setQueryData([...KEY, "one", p.id], p);
      return qc.invalidateQueries({ queryKey: [...KEY, "list"] });
    },
  });
}

export const useSaveProduct = () =>
  useProductMutation(({ id, body }: { id?: number; body: ProductRequest }) =>
    id ? unwrap(api.PUT("/api/products/{id}", { params: { path: { id } }, body })) : unwrap(api.POST("/api/products", { body })),
  );

export const useChangeCode = () =>
  useProductMutation(({ id, code, reason }: { id: number; code: string; reason: string }) =>
    unwrap(api.PUT("/api/products/{id}/code", { params: { path: { id } }, body: { code, reason } })),
  );

export const useDeactivateProduct = () =>
  useProductMutation(({ id, reason }: { id: number; reason: string }) =>
    unwrap(api.POST("/api/products/{id}/deactivate", { params: { path: { id } }, body: { reason } })),
  );

/** Bir nechta mahsulotni nofaol qilish (tanlanganlar) — har biri alohida, sabab bilan. */
export function useBulkDeactivate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, reason }: { ids: number[]; reason: string }) => {
      await ensureCsrf();
      for (const id of ids) await unwrap(api.POST("/api/products/{id}/deactivate", { params: { path: { id } }, body: { reason } }));
      return ids.length;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: [...KEY] }),
  });
}

export const useActivateProduct = () =>
  useProductMutation((id: number) => unwrap(api.POST("/api/products/{id}/activate", { params: { path: { id } } })));

/** Shakl qiymatlari (hammasi satr — TextField uchun). */
export interface ProductForm {
  name: string;
  contractName: string;
  classifierName: string;
  manufacturerId: string | null;
  categoryId: string | null;
  countryId: string | null;
  unitId: string | null;
  supplyEmployeeId: string | null;
  ikpu: string;
  farmId: string;
  barcodes: string;
  controlled: boolean;
  marked: boolean;
  prescription: boolean;
  vatRate: string;
  minQty: string;
  maxQty: string;
  dosageForm: DosageForm | null;
  dose: string;
  packQty: string;
  perPack: string;
  note: string;
}

export type DosageForm = NonNullable<ProductRequest["dosageForm"]>;
export const DOSAGE_FORMS: DosageForm[] = ["TABLET", "CAPSULE", "AMPOULE", "VIAL", "SYRUP", "OINTMENT", "PEN", "POWDER", "GEL"];

export const EMPTY_FORM: ProductForm = {
  name: "",
  contractName: "",
  classifierName: "",
  manufacturerId: null,
  categoryId: null,
  countryId: null,
  unitId: null,
  supplyEmployeeId: null,
  ikpu: "",
  farmId: "",
  barcodes: "",
  controlled: false,
  marked: false,
  prescription: false,
  vatRate: "12",
  minQty: "",
  maxQty: "",
  dosageForm: null,
  dose: "",
  packQty: "",
  perPack: "",
  note: "",
};

export function formFromProduct(p: ProductDetail): ProductForm {
  const id = (r?: { id: number } | null) => (r ? String(r.id) : null);
  return {
    name: p.name,
    contractName: p.contractName ?? "",
    classifierName: p.classifierName ?? "",
    manufacturerId: id(p.manufacturer),
    categoryId: id(p.category),
    countryId: id(p.country),
    unitId: String(p.unit.id),
    supplyEmployeeId: id(p.supplyEmployee),
    ikpu: p.ikpu ?? "",
    farmId: p.farmId ?? "",
    barcodes: p.barcodes.join("\n"),
    controlled: p.controlled,
    marked: p.marked,
    prescription: p.prescription,
    vatRate: p.vatRate.replace(/\.00$/, ""),
    minQty: p.minQty ? String(p.minQty) : "",
    maxQty: p.maxQty ? String(p.maxQty) : "",
    dosageForm: p.dosageForm ?? null,
    dose: p.dose ?? "",
    packQty: p.packQty ? String(p.packQty) : "",
    perPack: p.perPack ? String(p.perPack) : "",
    note: p.note ?? "",
  };
}

/** Shakl xatosi — `products.form.errors.<kalit>` (tarjima komponentda). */
export type ProductFormError = "qty" | "minMax" | "vat" | "unit";

/** Shakl → API soʻrovi; mahalliy xatolar (raqamlar) — maydon boʻyicha. */
export function toRequest(f: ProductForm): { body?: ProductRequest; errors: Record<string, ProductFormError> } {
  const errors: Record<string, ProductFormError> = {};
  const qty = (raw: string, key: string) => {
    const t = raw.trim();
    if (!t) return undefined;
    if (!/^\d+$/.test(t) || Number(t) < 1) {
      errors[key] = "qty";
      return undefined;
    }
    return Number(t);
  };
  const minQty = qty(f.minQty, "minQty");
  const maxQty = qty(f.maxQty, "maxQty");
  if (minQty && maxQty && minQty > maxQty) errors.maxQty = "minMax";
  const packQty = qty(f.packQty, "packQty");
  const perPack = qty(f.perPack, "perPack");
  const vat = f.vatRate.trim().replace(",", ".");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(vat) || Number(vat) > 100) errors.vatRate = "vat";
  if (!f.unitId) errors.unitId = "unit";
  if (Object.keys(errors).length > 0) return { errors };
  const num = (v: string | null) => (v ? Number(v) : undefined);
  const text = (v: string) => v.trim() || undefined;
  return {
    errors,
    body: {
      name: f.name,
      contractName: text(f.contractName),
      classifierName: text(f.classifierName),
      manufacturerId: num(f.manufacturerId),
      categoryId: num(f.categoryId),
      countryId: num(f.countryId),
      unitId: Number(f.unitId),
      supplyEmployeeId: num(f.supplyEmployeeId),
      ikpu: text(f.ikpu),
      farmId: text(f.farmId),
      barcodes: f.barcodes
        .split(/[\s,;]+/)
        .map((b) => b.trim())
        .filter(Boolean),
      controlled: f.controlled,
      marked: f.marked,
      prescription: f.prescription,
      vatRate: vat,
      minQty,
      maxQty,
      dosageForm: f.dosageForm ?? undefined,
      dose: text(f.dose),
      packQty,
      perPack,
      note: text(f.note),
    },
  };
}

/** Kartochka: mahsulot tarixi (audit). */
export function useProductHistory(id: number) {
  return useQuery({
    queryKey: [...KEY, "history", id],
    queryFn: () => unwrap(api.GET("/api/products/{id}/history", { params: { path: { id } } })),
  });
}

/** Kartochka: qoldiq (zona × partiya), filiallar boʻyicha, harakatlar. */
export function useProductStockCard(id: number, branchId: number | null) {
  return useQuery({
    queryKey: ["stock", "product-card", id, branchId],
    queryFn: () =>
      unwrap(
        api.GET("/api/stock/product-card/{productId}", {
          params: { path: { productId: id }, query: { branchId: branchId ?? undefined } },
        }),
      ),
  });
}

/** Kartochka «Narxlar»: bazaviy narx tarixi (filial boʻyicha). */
export function usePriceHistory(productId: number, branchId: number | null) {
  return useQuery({
    queryKey: ["prices", "history", productId, branchId],
    queryFn: () => unwrap(api.GET("/api/prices/history", { params: { query: { productId, branchId: branchId ?? undefined } } })),
  });
}
