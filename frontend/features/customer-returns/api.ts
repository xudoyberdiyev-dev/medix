"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ensureCsrf } from "@/features/auth/session";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

export type CustomerReturnSummary = components["schemas"]["CustomerReturnSummary"];
export type CustomerReturnDetail = components["schemas"]["CustomerReturnDetail"];
export type CustomerReturnStatus = CustomerReturnDetail["status"];
export type CustomerReturnRequest = components["schemas"]["CustomerReturnRequest"];
export type ReturnableSale = components["schemas"]["ReturnableSale"];
export type ReturnableLine = components["schemas"]["ReturnableLine"];

/**
 * Ruxsatlar: koʻrish — qm.view, yaratish — qm.create (Operator), qabul qilish — qm.approve (Ombor mudiri),
 * oʻtkazilganini bekor qilish — qm.cancelPosted (Direktor).
 */
export const QM_CREATE = "qm.create";
export const QM_APPROVE = "qm.approve";
export const QM_CANCEL_POSTED = "qm.cancelPosted";
export const QM_VIEW_KEYS = ["qm.view", QM_CREATE, QM_APPROVE, QM_CANCEL_POSTED];

export const QM_STATUSES = ["PENDING", "POSTED", "REJECTED", "CANCELLED"] as const satisfies readonly CustomerReturnStatus[];

export function useCustomerReturns(branchId: number | null, status: CustomerReturnStatus | null, q: string, page: number) {
  return useQuery({
    queryKey: ["customer-returns", "list", branchId, status, q, page],
    queryFn: () =>
      unwrap(
        api.GET("/api/customer-returns", {
          params: {
            query: { branchId: branchId ?? undefined, status: status ?? undefined, q: q || undefined, page: page - 1, size: 50 },
          },
        }),
      ),
    placeholderData: keepPreviousData,
  });
}

export function useCustomerReturn(id: number | null) {
  return useQuery({
    queryKey: ["customer-returns", "one", id],
    queryFn: () => unwrap(api.GET("/api/customer-returns/{id}", { params: { path: { id: id ?? 0 } } })),
    enabled: id !== null,
  });
}

export function useReturnableSales(customerId: number | null, branchId: number | null) {
  return useQuery({
    queryKey: ["customer-returns", "sales", customerId, branchId],
    queryFn: () =>
      unwrap(
        api.GET("/api/customer-returns/sales", {
          params: { query: { customerId: customerId ?? 0, branchId: branchId ?? undefined } },
        }),
      ),
    enabled: customerId !== null,
  });
}

export function useReturnableLines(saleId: number | null) {
  return useQuery({
    queryKey: ["customer-returns", "lines", saleId],
    queryFn: () => unwrap(api.GET("/api/customer-returns/sales/{saleId}/lines", { params: { path: { saleId: saleId ?? 0 } } })),
    enabled: saleId !== null,
  });
}

function useQmMutation<T>(fn: (v: T) => Promise<CustomerReturnDetail>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: T) => {
      await ensureCsrf();
      return fn(v);
    },
    onSuccess: async (d) => {
      qc.setQueryData(["customer-returns", "one", d.id], d);
      await qc.invalidateQueries({ queryKey: ["customer-returns", "list"] });
      await qc.invalidateQueries({ queryKey: ["customer-returns", "sales"] });
      await qc.invalidateQueries({ queryKey: ["customer-returns", "lines"] });
      await qc.invalidateQueries({ queryKey: ["stock"] });
      await qc.invalidateQueries({ queryKey: ["debts"] });
    },
  });
}

export function useCreateCustomerReturn() {
  return useQmMutation((body: CustomerReturnRequest) => unwrap(api.POST("/api/customer-returns", { body })));
}

export function useApproveCustomerReturn() {
  return useQmMutation((id: number) => unwrap(api.POST("/api/customer-returns/{id}/approve", { params: { path: { id } } })));
}

export function useRejectCustomerReturn() {
  return useQmMutation((v: { id: number; reason: string }) =>
    unwrap(api.POST("/api/customer-returns/{id}/reject", { params: { path: { id: v.id } }, body: { reason: v.reason } })),
  );
}

export function useCancelCustomerReturn() {
  return useQmMutation((v: { id: number; reason: string }) =>
    unwrap(api.POST("/api/customer-returns/{id}/cancel", { params: { path: { id: v.id } }, body: { reason: v.reason } })),
  );
}
