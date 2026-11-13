"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ensureCsrf } from "@/features/auth/session";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { orderQuery, type OrderFilters } from "./url-state";

export type OrderSummary = components["schemas"]["OrderSummary"];
export type OrderDetail = components["schemas"]["OrderDetail"];
export type OrderLine = components["schemas"]["OrderLine"];
export type OrderIssue = components["schemas"]["OrderIssue"];
export type OrderRequest = components["schemas"]["OrderRequest"];
export type OrderStatus = OrderDetail["status"];

export const ORDER_CREATE = "orders.create";
export const ORDER_CANCEL = "orders.cancel";
export const ORDER_MANAGE = "orders.manage";
export const ORDER_DISCOUNT = "orders.discount";
export const ORDER_CANCEL_PICK = "orders.cancelPick";
export const APPROVE_BRANCH = "approvals.branch";
export const APPROVE_DIRECTOR = "approvals.director";

export const STATUS_LABELS: Record<OrderStatus, string> = {
  DRAFT: "Qoralama",
  PENDING_APPROVAL: "Tasdiqlashda",
  QUEUED: "Navbatda",
  PICKING: "Yigʻilmoqda",
  MARKING: "Markirovkada",
  CHECKING: "Hisobdan oʻtkazilmoqda",
  DOCUMENTING: "Hujjatlashtirilmoqda",
  LOADING: "Yuklanmoqda",
  IN_TRANSIT: "Yoʻlda",
  DELIVERED: "Yetkazildi",
  UNDELIVERED: "Yetkazilmadi",
  REJECTED: "Rad etilgan",
  CANCELLED: "Bekor qilingan",
};

/** «Navbatda» … «Yuklanmoqda» — ombor bosqichlari (bekor qilish — Filial rahbari, Direktor, Ombor mudiri). */
export const WAREHOUSE_STAGES: OrderStatus[] = ["QUEUED", "PICKING", "MARKING", "CHECKING", "DOCUMENTING", "LOADING"];

/** Bekor qilish mumkinmi (server qoidasi bilan bir xil, SPEC 5.2). */
export function canCancelOrder(
  status: OrderStatus,
  perms: { own: boolean; cancel: boolean; manage: boolean; cancelPick: boolean },
): boolean {
  if (status === "DRAFT" || status === "PENDING_APPROVAL") return perms.manage || (perms.cancel && perms.own);
  if (WAREHOUSE_STAGES.includes(status)) return perms.cancelPick;
  return false;
}

/** Tasdiqlay oladimi: Direktor darajasi — faqat approvals.director. */
export function canApprove(level: OrderDetail["approvalLevel"] | null, branch: boolean, director: boolean): boolean {
  if (!level) return false;
  return level === "DIRECTOR" ? director : branch || director;
}

export function useOrders(f: OrderFilters, branchId: number | null) {
  return useQuery({
    queryKey: ["orders", "list", f, branchId],
    queryFn: () =>
      unwrap(
        api.GET("/api/orders", {
          params: { query: { ...orderQuery(f, branchId), page: f.page - 1, size: f.size } },
        }),
      ),
    placeholderData: keepPreviousData,
  });
}

/** OrderCard «Tarix» yorligʻi — audit jurnalidan. */
export function useOrderHistory(id: number) {
  return useQuery({
    queryKey: ["orders", "history", id],
    queryFn: () => unwrap(api.GET("/api/orders/{id}/history", { params: { path: { id } } })),
  });
}

export function useOrder(id: number | null) {
  return useQuery({
    queryKey: ["orders", "one", id],
    queryFn: () => unwrap(api.GET("/api/orders/{id}", { params: { path: { id: id ?? 0 } } })),
    enabled: id !== null,
  });
}

function useOrderMutation<T>(fn: (v: T) => Promise<OrderDetail>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: T) => {
      await ensureCsrf();
      return fn(v);
    },
    onSuccess: async (d) => {
      qc.setQueryData(["orders", "one", d.id], d);
      await qc.invalidateQueries({ queryKey: ["orders", "list"] });
    },
  });
}

export const useSaveOrder = () =>
  useOrderMutation(({ id, body }: { id?: number; body: OrderRequest }) =>
    id ? unwrap(api.PUT("/api/orders/{id}", { params: { path: { id } }, body })) : unwrap(api.POST("/api/orders", { body })),
  );

export const useSubmitOrder = () =>
  useOrderMutation((id: number) => unwrap(api.POST("/api/orders/{id}/submit", { params: { path: { id } } })));

export const useApproveOrder = () =>
  useOrderMutation((id: number) => unwrap(api.POST("/api/orders/{id}/approve", { params: { path: { id } } })));

export const useReturnOrder = () =>
  useOrderMutation((id: number) => unwrap(api.POST("/api/orders/{id}/return", { params: { path: { id } } })));

export const useRejectOrder = () =>
  useOrderMutation(({ id, reason }: { id: number; reason: string }) =>
    unwrap(api.POST("/api/orders/{id}/reject", { params: { path: { id } }, body: { reason } })),
  );

export const useCancelOrder = () =>
  useOrderMutation(({ id, reason }: { id: number; reason: string }) =>
    unwrap(api.POST("/api/orders/{id}/cancel", { params: { path: { id } }, body: { reason } })),
  );

export async function searchCustomers(q: string) {
  const page = await unwrap(api.GET("/api/counterparties", { params: { query: { q, role: "CUSTOMER", size: 20 } } }));
  return page.items
    .filter((c) => c.active && !c.blocked)
    .map((c) => ({ value: String(c.id), label: c.name, sub: c.tin, meta: c.phone ?? undefined }));
}

export async function previousOrders(customerId: number) {
  return unwrap(api.GET("/api/orders/previous", { params: { query: { customerId } } }));
}

export async function defaultPaymentType(customerId: number) {
  return unwrap(api.GET("/api/orders/default-payment-type", { params: { query: { customerId } } }));
}

export async function loadOrder(id: number) {
  return unwrap(api.GET("/api/orders/{id}", { params: { path: { id } } }));
}

/** O10a: Saplayn tekshiruvi uchun buyurtma kodlari .xlsx (yuklab olish serverda qayd etiladi). */
export function verifyExportUrl(orderId: number): string {
  return `/api/marking/orders/${orderId}/verify-export`;
}

/** Kodlar .xlsx manzili (jurnal filtrlari bilan; orderId — bitta buyurtma). */
export function codesExportUrl(f: { today?: boolean; mine?: boolean; q?: string; orderId?: number }): string {
  const p = new URLSearchParams();
  if (f.orderId) p.set("orderId", String(f.orderId));
  if (f.today) p.set("today", "true");
  if (f.mine) p.set("mine", "true");
  if (f.q?.trim()) p.set("q", f.q.trim());
  const qs = p.toString();
  return `/api/marking/codes/export${qs ? `?${qs}` : ""}`;
}
