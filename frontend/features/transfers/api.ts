"use client";

import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "@/lib/api/client";

/** Koʻchirish — ZK, OK, FS bitta roʻyxatda (`/api/transfers/overview`). */
export function useTransfersOverview(branchId: number | null, enabled: boolean) {
  return useQuery({
    queryKey: ["transfers", "overview", branchId],
    queryFn: () => unwrap(api.GET("/api/transfers/overview", { params: { query: { branchId: branchId ?? undefined } } })),
    enabled,
  });
}
