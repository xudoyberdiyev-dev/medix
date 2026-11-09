"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ensureCsrf } from "@/features/auth/session";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

export type Employee = components["schemas"]["Employee"];
export type CreateEmployeeRequest = components["schemas"]["CreateEmployeeRequest"];
export type UpdateEmployeeRequest = components["schemas"]["UpdateEmployeeRequest"];

const KEY = ["employees"] as const;

export function useEmployees() {
  return useQuery({ queryKey: KEY, queryFn: () => unwrap(api.GET("/api/employees")) });
}

function useEmployeeMutation<T, R = Employee>(fn: (v: T) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: T) => {
      await ensureCsrf();
      return fn(v);
    },
    onSuccess: async () => {
      // Xodim roʻyxati usta holatida, oʻrinlarda va kassalarda ham koʻrinadi
      await Promise.all([
        qc.invalidateQueries({ queryKey: KEY }),
        qc.invalidateQueries({ queryKey: ["setup"] }),
        qc.invalidateQueries({ queryKey: ["money-accounts"] }),
      ]);
    },
  });
}

export const useUpdateEmployee = () =>
  useEmployeeMutation(({ id, body }: { id: number; body: UpdateEmployeeRequest }) =>
    unwrap(api.PUT("/api/employees/{id}", { params: { path: { id } }, body })),
  );

export function useSeats() {
  return useQuery({ queryKey: [...KEY, "seats"], queryFn: () => unwrap(api.GET("/api/employees/seats")) });
}

/** Login taklifi (ism + familiya) va kiritilgan login boʻshligi — serverda tekshiriladi. */
export function useLoginCheck(q: { firstName: string; lastName: string; login: string; exceptId?: number } | null) {
  return useQuery({
    queryKey: [...KEY, "login-check", q],
    enabled: q !== null,
    staleTime: 5_000,
    placeholderData: keepPreviousData,
    queryFn: () =>
      unwrap(
        api.GET("/api/employees/login-check", {
          params: {
            query: {
              firstName: q?.firstName || undefined,
              lastName: q?.lastName || undefined,
              login: q?.login || undefined,
              exceptId: q?.exceptId,
            },
          },
        }),
      ),
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

/** E3: Buxgalterga barcha filiallar doirasi — faqat Direktor. */
export const useSetAllBranches = () =>
  useEmployeeMutation(({ id, enabled }: { id: number; enabled: boolean }) =>
    unwrap(api.POST("/api/employees/{id}/all-branches", { params: { path: { id } }, body: { enabled } })),
  );

/** Qidiruv: ism, login yoki rol boʻyicha (katta-kichik harf farqsiz). */
export type EmployeeJournal = components["schemas"]["Journal"];

/** Xodim kartasi (prototip AdminStaff): kirishlar, harakatlar, ochiq sessiyalar, PIN holati. */
export function useEmployeeJournal(id: number) {
  return useQuery({
    queryKey: [...KEY, "journal", id],
    queryFn: () => unwrap(api.GET("/api/employees/{id}/journal", { params: { path: { id } } })),
  });
}

export const useEndSessions = () =>
  useEmployeeMutation((id: number) => unwrap(api.POST("/api/employees/{id}/end-sessions", { params: { path: { id } } })));

export const useResetPin = () =>
  useEmployeeMutation((id: number) => unwrap(api.POST("/api/employees/{id}/reset-pin", { params: { path: { id } } })));

export function filterEmployees(list: Employee[], query: string): Employee[] {
  const q = query.trim().toLocaleLowerCase("uz");
  if (!q) return list;
  return list.filter((e) => [e.fullName, e.login, e.roleName].some((v) => v.toLocaleLowerCase("uz").includes(q)));
}

export function useBranches() {
  return useQuery({ queryKey: ["branches"], queryFn: () => unwrap(api.GET("/api/branches")) });
}
