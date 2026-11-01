"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ensureCsrf } from "@/features/auth/session";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

export type SetupStatus = components["schemas"]["SetupStatus"];
export type Branch = components["schemas"]["Branch"];
export type Warehouse = components["schemas"]["Warehouse"];
export type Employee = components["schemas"]["Employee"];
export type Role = components["schemas"]["Role"];
export type BranchRequest = components["schemas"]["BranchRequest"];
export type WarehouseRequest = components["schemas"]["WarehouseRequest"];
export type EmployeeRequest = components["schemas"]["EmployeeRequest"];

export const SETUP_KEY = ["setup"] as const;

export function useSetupStatus() {
  return useQuery({ queryKey: SETUP_KEY, queryFn: () => unwrap(api.GET("/api/setup")) });
}

export function useRoles() {
  return useQuery({ queryKey: ["roles"], queryFn: () => unwrap(api.GET("/api/roles")) });
}

function useSetupMutation<TBody, TResult>(fn: (body: TBody) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: TBody) => {
      await ensureCsrf();
      return fn(body);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: SETUP_KEY }),
  });
}

export function useSaveCompany() {
  return useSetupMutation((body: { name: string }) => unwrap(api.PUT("/api/setup/company", { body })));
}

export function useCreateBranch() {
  return useSetupMutation((body: BranchRequest) => unwrap(api.POST("/api/setup/branches", { body })));
}

export function useCreateWarehouse() {
  return useSetupMutation((body: WarehouseRequest) => unwrap(api.POST("/api/setup/warehouses", { body })));
}

export function useCreateEmployee() {
  return useSetupMutation((body: EmployeeRequest) => unwrap(api.POST("/api/setup/employees", { body })));
}

export function useCompleteSetup() {
  return useSetupMutation<void, SetupStatus>(() => unwrap(api.POST("/api/setup/complete")));
}

/** Usta qaysi qadamdan davom etadi: birinchi bajarilmagan qadam. */
export function firstIncompleteStep(s: SetupStatus): number {
  if (!s.company) return 0;
  if (s.branches.length === 0) return 1;
  if (s.branches.some((b) => !s.warehouses.some((w) => w.branchId === b.id))) return 2;
  return 3;
}
