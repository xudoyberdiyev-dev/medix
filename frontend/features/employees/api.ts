"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ensureCsrf } from "@/features/auth/session";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

export type Employee = components["schemas"]["Employee"];
export type CreateEmployeeRequest = components["schemas"]["CreateEmployeeRequest"];

const KEY = ["employees"] as const;

export function useEmployees() {
  return useQuery({ queryKey: KEY, queryFn: () => unwrap(api.GET("/api/employees")) });
}

function useEmployeeMutation<T>(fn: (v: T) => Promise<Employee>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: T) => {
      await ensureCsrf();
      return fn(v);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export const useCreateEmployee = () => useEmployeeMutation((body: CreateEmployeeRequest) => unwrap(api.POST("/api/employees", { body })));

export const useBlockEmployee = () =>
  useEmployeeMutation(({ id, reason }: { id: number; reason: string }) =>
    unwrap(api.POST("/api/employees/{id}/block", { params: { path: { id } }, body: { reason } })),
  );

export const useUnblockEmployee = () =>
  useEmployeeMutation((id: number) => unwrap(api.POST("/api/employees/{id}/unblock", { params: { path: { id } } })));

export const useResetPassword = () =>
  useEmployeeMutation(({ id, temporaryPassword }: { id: number; temporaryPassword: string }) =>
    unwrap(api.POST("/api/employees/{id}/reset-password", { params: { path: { id } }, body: { temporaryPassword } })),
  );

/** Qidiruv: ism, login yoki rol boʻyicha (katta-kichik harf farqsiz). */
export function filterEmployees(list: Employee[], query: string): Employee[] {
  const q = query.trim().toLocaleLowerCase("uz");
  if (!q) return list;
  return list.filter((e) => [e.fullName, e.login, e.roleName].some((v) => v.toLocaleLowerCase("uz").includes(q)));
}

export function useBranches() {
  return useQuery({ queryKey: ["branches"], queryFn: () => unwrap(api.GET("/api/branches")) });
}
