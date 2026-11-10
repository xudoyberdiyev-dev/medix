"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ensureCsrf } from "@/features/auth/session";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

export type BranchSaleSummary = components["schemas"]["BranchSaleSummary"];
export type BranchSaleDetail = components["schemas"]["BranchSaleDetail"];
export type BranchSaleStatus = BranchSaleDetail["status"];
export type BranchSaleRequest = components["schemas"]["BranchSaleRequest"];
export type BranchSaleLine = BranchSaleDetail["lines"][number];
export type TargetWarehouse = components["schemas"]["TargetWarehouse"];
export type BranchBalance = components["schemas"]["BranchBalance"];
type ReceiveRequest = components["schemas"]["ReceiveRequest"];

/** Ruxsatlar (T12): qoralama — transfer.fs, joʻnatish — transfer.send, qabul — transfer.receive, bekor qilish — transfer.cancel. */
export const TRANSFER_FS = "transfer.fs";
export const FS_VIEW_KEYS = ["transfer.view", TRANSFER_FS, "transfer.send", "transfer.receive"];

export function useBranchSales(branchId: number | null, status: BranchSaleStatus | null, page: number, enabled = true) {
  return useQuery({
    queryKey: ["branch-sales", "list", branchId, status, page],
    queryFn: () =>
      unwrap(
        api.GET("/api/branch-sales", {
          params: { query: { branchId: branchId ?? undefined, status: status ?? undefined, page: page - 1, size: 50 } },
        }),
      ),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useBranchSale(id: number | null) {
  return useQuery({
    queryKey: ["branch-sales", "one", id],
    queryFn: () => unwrap(api.GET("/api/branch-sales/{id}", { params: { path: { id: id ?? 0 } } })),
    enabled: id !== null,
  });
}

export function useSellerZoneStock(zoneId: number | null) {
  return useQuery({
    queryKey: ["branch-sales", "zone-stock", zoneId],
    queryFn: () => unwrap(api.GET("/api/branch-sales/zone-stock", { params: { query: { zoneId: zoneId ?? 0 } } })),
    enabled: zoneId !== null,
  });
}

export function useBuyerWarehouses(sellerBranchId: number | null) {
  return useQuery({
    queryKey: ["branch-sales", "targets", sellerBranchId],
    queryFn: () => unwrap(api.GET("/api/branch-sales/targets", { params: { query: { sellerBranchId: sellerBranchId ?? 0 } } })),
    enabled: sellerBranchId !== null,
  });
}

function useFsMutation<T>(fn: (v: T) => Promise<BranchSaleDetail>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: T) => {
      await ensureCsrf();
      return fn(v);
    },
    onSuccess: async (d) => {
      qc.setQueryData(["branch-sales", "one", d.id], d);
      await qc.invalidateQueries({ queryKey: ["branch-sales", "list"] });
      await qc.invalidateQueries({ queryKey: ["branch-sales", "balances"] });
      await qc.invalidateQueries({ queryKey: ["branch-sales", "zone-stock"] });
      await qc.invalidateQueries({ queryKey: ["stock"] });
    },
  });
}

export function useCreateBranchSale() {
  return useFsMutation((body: BranchSaleRequest) => unwrap(api.POST("/api/branch-sales", { body })));
}

export function useUpdateBranchSale() {
  return useFsMutation((v: { id: number; body: BranchSaleRequest }) =>
    unwrap(api.PUT("/api/branch-sales/{id}", { params: { path: { id: v.id } }, body: v.body })),
  );
}

export function useSendBranchSale() {
  return useFsMutation((id: number) => unwrap(api.POST("/api/branch-sales/{id}/send", { params: { path: { id } } })));
}

export function useReceiveBranchSale() {
  return useFsMutation((v: { id: number; body: ReceiveRequest }) =>
    unwrap(api.POST("/api/branch-sales/{id}/receive", { params: { path: { id: v.id } }, body: v.body })),
  );
}

export function useCancelBranchSale() {
  return useFsMutation((id: number) => unwrap(api.POST("/api/branch-sales/{id}/cancel", { params: { path: { id } } })));
}

/** Filiallararo qarz qoldiqlari — faqat special.cost bilan (server ham tekshiradi). */
export function useBranchBalances(enabled: boolean) {
  return useQuery({
    queryKey: ["branch-sales", "balances"],
    queryFn: () => unwrap(api.GET("/api/branch-sales/balances")),
    enabled,
  });
}

export type FsShortageInfo = components["schemas"]["FsShortageInfo"];
export type FsShortageKind = components["schemas"]["FsShortageResolveRequest"]["kind"];
export type FsShortageBearer = NonNullable<components["schemas"]["FsShortageResolveRequest"]["bearer"]>;
export const TRANSFER_RESOLVE = "transfer.resolve";

/** FS kamomadi: ochiqmi, summa (special.cost), tarix. */
export function useBranchSaleShortage(id: number, enabled: boolean) {
  return useQuery({
    queryKey: ["branch-sales", "shortage", id],
    queryFn: () => unwrap(api.GET("/api/branch-sales/{id}/shortage", { params: { path: { id } } })),
    enabled,
  });
}

/** Hal qilish: HC (xaridor yoki sotuvchi zimmasida) yoki sotuvchiga qaytarish; qarz tuzatish serverda. */
export function useResolveBranchSaleShortage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: number; kind: FsShortageKind; bearer: FsShortageBearer; note: string }) => {
      await ensureCsrf();
      return unwrap(
        api.POST("/api/branch-sales/{id}/shortage/resolve", {
          params: { path: { id: v.id } },
          body: { kind: v.kind, bearer: v.bearer, note: v.note },
        }),
      );
    },
    onSuccess: async (d) => {
      qc.setQueryData(["branch-sales", "shortage", d.saleId], d);
      await qc.invalidateQueries({ queryKey: ["branch-sales", "balances"] });
      await qc.invalidateQueries({ queryKey: ["write-offs"] });
      await qc.invalidateQueries({ queryKey: ["stock"] });
    },
  });
}
