"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ensureCsrf } from "@/features/auth/session";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

/** O10d buxgalter faktura navbati: «Faktura yuborilishi kerak» → «Yuborildi» (buyurtma zanjiriga parallel). */
export type InvoiceTask = components["schemas"]["InvoiceTask"];
export type InvoiceTaskStatus = InvoiceTask["status"];
export type InvoiceTaskDetail = components["schemas"]["InvoiceTaskDetail"];
export type InvoiceFileKind = components["schemas"]["InvoiceFile"]["kind"];

export const INVOICES_VIEW = "invoices.view";
export const INVOICES_SEND = "invoices.send";
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
const FILE_TYPES = ["application/pdf", "image/jpeg", "image/png"];

export type InvoiceFilter = {
  status: InvoiceTaskStatus | null;
  branchId: number | null;
  from: string | null;
  to: string | null;
  q: string;
};

function query(f: InvoiceFilter) {
  return {
    status: f.status ?? undefined,
    branchId: f.branchId ?? undefined,
    from: f.from ?? undefined,
    to: f.to ?? undefined,
    q: f.q.trim() || undefined,
  };
}

export function useInvoiceTasks(f: InvoiceFilter, page: number, size: number) {
  return useQuery({
    queryKey: ["invoice-tasks", f, page, size],
    queryFn: () => unwrap(api.GET("/api/invoice-tasks", { params: { query: { ...query(f), page: page - 1, size } } })),
    placeholderData: keepPreviousData,
  });
}

/** Buyurtma kartochkasi «Hujjatlar»: vazifa boʻlmasa — null (404). */
export function useOrderInvoiceTask(orderId: number, enabled: boolean) {
  return useQuery({
    queryKey: ["invoice-tasks", "order", orderId],
    enabled,
    retry: false,
    queryFn: async () => {
      const r = await api.GET("/api/invoice-tasks/by-order/{orderId}", { params: { path: { orderId } } });
      if (r.response.status === 404) return null;
      return unwrap(Promise.resolve(r));
    },
  });
}

/** Faylni tekshirish (serverdagi bilan bir xil): tur va hajm. */
export function fileProblem(file: { type: string; name: string; size: number }): "type" | "size" | null {
  const n = file.name.toLowerCase();
  const byName = n.endsWith(".pdf") || n.endsWith(".jpg") || n.endsWith(".jpeg") || n.endsWith(".png");
  if (!FILE_TYPES.includes(file.type === "image/jpg" ? "image/jpeg" : file.type) && !byName) return "type";
  if (file.size === 0 || file.size > MAX_FILE_BYTES) return "size";
  return null;
}

export async function uploadInvoiceFile(taskId: number, kind: InvoiceFileKind, file: File): Promise<number> {
  await ensureCsrf();
  const r = await unwrap(
    api.POST("/api/invoice-tasks/{id}/files", {
      params: { path: { id: taskId }, query: { kind } },
      body: { file: file as unknown as string },
      bodySerializer: () => {
        const fd = new FormData();
        fd.append("file", file);
        return fd;
      },
    }),
  );
  return r.id;
}

export function useMarkInvoiceSent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: number; efakturaNumber: string; efakturaDate: string }) => {
      await ensureCsrf();
      return unwrap(
        api.POST("/api/invoice-tasks/{id}/sent", {
          params: { path: { id: v.id } },
          body: { efakturaNumber: v.efakturaNumber, efakturaDate: v.efakturaDate },
        }),
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoice-tasks"] });
      qc.invalidateQueries({ queryKey: ["home"] });
    },
  });
}

export const invoicePdfUrl = (id: number) => `/api/invoice-tasks/${id}/invoice/pdf`;
export const invoiceXlsxUrl = (id: number) => `/api/invoice-tasks/${id}/invoice/xlsx`;
export const invoiceCodesUrl = (id: number) => `/api/invoice-tasks/${id}/codes`;
export const invoiceFileUrl = (fileId: number) => `/api/invoice-tasks/files/${fileId}`;

/** Kutish vaqti (navbatga tushgandan buyon yoki yuborilguncha): soat va kun. */
export function waitParts(openedAt: string, until: string | null | undefined, now: number): { d: number; h: number; late: boolean } {
  const ms = Math.max(0, (until ? Date.parse(until) : now) - Date.parse(openedAt));
  const hours = Math.floor(ms / 3_600_000);
  return { d: Math.floor(hours / 24), h: hours % 24, late: ms > 24 * 3_600_000 };
}
