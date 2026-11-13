"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ensureCsrf } from "@/features/auth/session";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

export type InventoryCountSummary = components["schemas"]["InventoryCountSummary"];
export type InventoryCountDetail = components["schemas"]["InventoryCountDetail"];
export type InventoryCountLine = InventoryCountDetail["lines"][number];
export type InventoryCountStatus = InventoryCountDetail["status"];
export type InventoryCountRequest = components["schemas"]["InventoryCountRequest"];
export type InventoryCountEntry = components["schemas"]["InventoryCountEntry"];
export type InventoryBatchHit = components["schemas"]["InventoryBatchHit"];

/**
 * Ruxsatlar (T12): koʻrish — inventory.view, yaratish / bekor qilish — inventory.create, sanoqni ochish / qayta sanash —
 * inventory.openCount, sanash — inventory.count, tasdiqlash — inventory.approve, Direktor darajasi — inventory.director.
 */
export const IN_CREATE = "inventory.create";
export const IN_OPEN = "inventory.openCount";
export const IN_COUNT = "inventory.count";
export const IN_APPROVE = "inventory.approve";
export const IN_DIRECTOR = "inventory.director";
export const IN_VIEW_KEYS = ["inventory.view", IN_CREATE, IN_COUNT, IN_APPROVE];

/** T12 ivDirApprove — server bilan bir xil (kamomad tannarxi shundan KATTA boʻlsa — Direktor). */
export const IN_DIRECTOR_LIMIT = "5000000.00";

export const IN_STATUS_LABELS: Record<InventoryCountStatus, string> = {
  DRAFT: "Qoralama",
  COUNTING: "Sanoq",
  CHECK: "Tekshirish",
  POSTED: "Tasdiqlangan",
  CANCELLED: "Bekor qilingan",
};

/**
 * Kiritilgan miqdorlardan oʻzgargan qatorlar: manfiy boʻlmagan butun son, saqlangan qiymatdan farq qilsa. Xato boʻlsa — qator
 * (mahsulot, partiya); matn — `inventoryCounts.errors.qty`.
 */
export function changedEntries(
  lines: InventoryCountLine[],
  draft: Record<number, string>,
): { entries: InventoryCountEntry[]; error: { product: string; batch: string } | null } {
  const entries: InventoryCountEntry[] = [];
  for (const l of lines) {
    const raw = draft[l.id];
    if (raw === undefined) continue;
    const v = raw.trim();
    if (v === "") continue;
    if (!/^\d+$/.test(v)) return { entries: [], error: { product: l.productName, batch: l.batchNumber } };
    const n = Number(v);
    if (n !== l.countedQty) entries.push({ lineId: l.id, countedQty: n });
  }
  return { entries, error: null };
}

/** Sanoq jarayoni: sanalgan qatorlar ulushi (0–100). */
export function progress(lines: InventoryCountLine[]): number {
  if (lines.length === 0) return 0;
  return Math.round((lines.filter((l) => l.countedQty != null).length * 100) / lines.length);
}

export function useInventoryOverview(branchId: number | null, enabled: boolean) {
  return useQuery({
    enabled,
    queryKey: ["inventory-counts", "overview", branchId],
    queryFn: () => unwrap(api.GET("/api/inventory-counts/overview", { params: { query: { branchId: branchId ?? undefined } } })),
  });
}

export function useInventoryCounts(branchId: number | null, status: InventoryCountStatus | null, page: number) {
  return useQuery({
    queryKey: ["inventory-counts", "list", branchId, status, page],
    queryFn: () =>
      unwrap(
        api.GET("/api/inventory-counts", {
          params: { query: { branchId: branchId ?? undefined, status: status ?? undefined, page: page - 1, size: 50 } },
        }),
      ),
    placeholderData: keepPreviousData,
  });
}

export function useInventoryCount(id: number | null) {
  return useQuery({
    queryKey: ["inventory-counts", "one", id],
    queryFn: () => unwrap(api.GET("/api/inventory-counts/{id}", { params: { path: { id: id ?? 0 } } })),
    enabled: id !== null,
  });
}

export function useInventoryBatches(id: number, q: string) {
  const query = q.trim();
  return useQuery({
    queryKey: ["inventory-counts", "batches", id, query],
    // O3: boʻsh soʻrov ham roʻyxat qaytaradi (birinchi 20 ta)
    queryFn: () => unwrap(api.GET("/api/inventory-counts/{id}/batches", { params: { path: { id }, query: { q: query } } })),
  });
}

function useInMutation<T>(fn: (v: T) => Promise<InventoryCountDetail>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: T) => {
      await ensureCsrf();
      return fn(v);
    },
    onSuccess: async (d) => {
      qc.setQueryData(["inventory-counts", "one", d.id], d);
      await qc.invalidateQueries({ queryKey: ["inventory-counts", "list"] });
      if (d.status === "POSTED") await qc.invalidateQueries({ queryKey: ["stock"] });
    },
  });
}

export function useCreateInventoryCount() {
  return useInMutation((body: InventoryCountRequest) => unwrap(api.POST("/api/inventory-counts", { body })));
}

export function useStartInventoryCount() {
  return useInMutation((id: number) => unwrap(api.POST("/api/inventory-counts/{id}/start", { params: { path: { id } } })));
}

export function useSaveCounts() {
  return useInMutation((v: { id: number; entries: InventoryCountEntry[] }) =>
    unwrap(api.PUT("/api/inventory-counts/{id}/counts", { params: { path: { id: v.id } }, body: { entries: v.entries } })),
  );
}

export function useSubmitInventoryCount() {
  return useInMutation((id: number) => unwrap(api.POST("/api/inventory-counts/{id}/submit", { params: { path: { id } } })));
}

export function useRecountInventoryCount() {
  return useInMutation((v: { id: number; lineIds?: number[] }) =>
    unwrap(api.POST("/api/inventory-counts/{id}/recount", { params: { path: { id: v.id } }, body: { lineIds: v.lineIds } })),
  );
}

export function useUpdateInventoryCount() {
  return useInMutation((v: { id: number; body: InventoryCountRequest }) =>
    unwrap(api.PUT("/api/inventory-counts/{id}", { params: { path: { id: v.id } }, body: v.body })),
  );
}

export function useLineNote() {
  return useInMutation((v: { id: number; lineId: number; note: string }) =>
    unwrap(
      api.PUT("/api/inventory-counts/{id}/lines/{lineId}/note", {
        params: { path: { id: v.id, lineId: v.lineId } },
        body: { note: v.note.trim() || undefined },
      }),
    ),
  );
}

export function useScopeOptions(warehouseId: number | null) {
  return useQuery({
    queryKey: ["inventory-counts", "scope-options", warehouseId],
    queryFn: () => unwrap(api.GET("/api/inventory-counts/scope-options", { params: { query: { warehouseId: warehouseId ?? 0 } } })),
    enabled: warehouseId !== null,
  });
}

export function useApproveInventoryCount() {
  return useInMutation((id: number) => unwrap(api.POST("/api/inventory-counts/{id}/approve", { params: { path: { id } } })));
}

export function useCancelInventoryCount() {
  return useInMutation((v: { id: number; reason: string }) =>
    unwrap(api.POST("/api/inventory-counts/{id}/cancel", { params: { path: { id: v.id } }, body: { reason: v.reason } })),
  );
}
