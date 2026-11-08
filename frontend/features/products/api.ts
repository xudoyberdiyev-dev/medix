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

export type DosageForm = NonNullable<ProductRequest["dosageForm"]>;
export const DOSAGE_FORMS: DosageForm[] = ["TABLET", "CAPSULE", "AMPOULE", "VIAL", "SYRUP", "OINTMENT", "PEN", "POWDER", "GEL"];

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

/** Shakl: «Yangi kod yaratish» — boʻsh kod taklifi (har chaqiruvda yangi). */
export async function fetchNewCode(): Promise<string> {
  return (await unwrap(api.GET("/api/products/new-code"))).code;
}

export type DuplicateCheck = components["schemas"]["DuplicateCheck"];

/** Shakl: dublikatlar (nom + ishlab chiqaruvchi, kod, shtrix-kodlar) — kiritish toʻxtagach. */
export function useDuplicates(
  q: { name: string; manufacturerId: string | null; code: string; barcodes: string[]; excludeId: number | null },
  enabled: boolean,
) {
  return useQuery({
    queryKey: [...KEY, "duplicates", q],
    queryFn: () =>
      unwrap(
        api.GET("/api/products/duplicates", {
          params: {
            query: {
              name: q.name.trim() || undefined,
              manufacturerId: q.manufacturerId ? Number(q.manufacturerId) : undefined,
              code: q.code || undefined,
              barcodes: q.barcodes.length ? q.barcodes : undefined,
              excludeId: q.excludeId ?? undefined,
            },
          },
        }),
      ),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });
}
