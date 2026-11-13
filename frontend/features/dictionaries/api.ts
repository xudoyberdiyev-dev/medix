"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ensureCsrf } from "@/features/auth/session";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

export type Entry = components["schemas"]["Entry"];
export type Vehicle = components["schemas"]["Vehicle"];
export type ExpenseItem = components["schemas"]["ExpenseItem"];
export type DictionaryKind = "MANUFACTURER" | "CATEGORY" | "UNIT" | "COUNTRY" | "REGION";

export interface DictionaryMeta {
  kind: DictionaryKind;
  title: string;
  singular: string;
  /** Qisqa nom maydoni: yorligʻi va maslahati. */
  shortName?: { label: string; hint: string; mono?: boolean };
  empty: string;
  /** Oʻzgartirish ruxsati (1.3). */
  permission: string;
}

export const DICTIONARIES: DictionaryMeta[] = [
  {
    kind: "MANUFACTURER",
    title: "Ishlab chiqaruvchilar",
    singular: "Ishlab chiqaruvchi",
    empty: "Dori ishlab chiqaruvchi korxonalar",
    permission: "lookups.makers",
  },
  {
    kind: "CATEGORY",
    title: "Kategoriyalar",
    singular: "Kategoriya",
    empty: "Mahsulot guruhlari, masalan «Antibiotiklar»",
    permission: "lookups.cats",
  },
  {
    kind: "UNIT",
    title: "Birliklar",
    singular: "Birlik",
    shortName: { label: "Qisqa yozuvi", hint: "Masalan: dona, qad." },
    empty: "Oʻlchov birliklari",
    permission: "lookups.units",
  },
  {
    kind: "COUNTRY",
    title: "Davlatlar",
    singular: "Davlat",
    shortName: { label: "Kod", hint: "2 ta lotin harfi, masalan UZ", mono: true },
    empty: "Ishlab chiqarilgan davlatlar",
    permission: "lookups.makers",
  },
  { kind: "REGION", title: "Hududlar", singular: "Hudud", empty: "Mijozlar manzili va yetkazish hududlari", permission: "lookups.regions" },
];

/** Mashinalar va xarajat moddalari ruxsatlari (1.3). */
export const VEHICLE_PERMISSION = "lookups.fleet";
export const EXPENSE_PERMISSION = "lookups.items";

function useInvalidating<T, R>(key: readonly unknown[], fn: (v: T) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: T) => {
      await ensureCsrf();
      return fn(v);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
}

const dictKey = (kind: DictionaryKind) => ["dictionaries", kind] as const;

export function useDictionary(kind: DictionaryKind) {
  return useQuery({
    queryKey: dictKey(kind),
    queryFn: () => unwrap(api.GET("/api/dictionaries/{kind}", { params: { path: { kind } } })),
  });
}

export const useSaveEntry = (kind: DictionaryKind) =>
  useInvalidating(dictKey(kind), ({ id, name, shortName, code }: { id?: number; name: string; shortName?: string; code?: string }) => {
    const body = { name, shortName: shortName?.trim() || undefined, code: code?.trim() || undefined };
    return id
      ? unwrap(api.PUT("/api/dictionaries/{kind}/{id}", { params: { path: { kind, id } }, body }))
      : unwrap(api.POST("/api/dictionaries/{kind}", { params: { path: { kind } }, body }));
  });

export const useToggleEntry = (kind: DictionaryKind) =>
  useInvalidating(dictKey(kind), ({ id, active }: { id: number; active: boolean }) =>
    active
      ? unwrap(api.POST("/api/dictionaries/{kind}/{id}/activate", { params: { path: { kind, id } } }))
      : unwrap(api.POST("/api/dictionaries/{kind}/{id}/deactivate", { params: { path: { kind, id } } })),
  );

const VEHICLES = ["vehicles"] as const;

export function useVehicles() {
  return useQuery({ queryKey: VEHICLES, queryFn: () => unwrap(api.GET("/api/vehicles")) });
}

export const useSaveVehicle = () =>
  useInvalidating(
    VEHICLES,
    ({ id, ...body }: { id?: number; branchId: number; plateNumber: string; model: string; hasRefrigerator: boolean }) =>
      id ? unwrap(api.PUT("/api/vehicles/{id}", { params: { path: { id } }, body })) : unwrap(api.POST("/api/vehicles", { body })),
  );

export const useToggleVehicle = () =>
  useInvalidating(VEHICLES, ({ id, active }: { id: number; active: boolean }) =>
    active
      ? unwrap(api.POST("/api/vehicles/{id}/activate", { params: { path: { id } } }))
      : unwrap(api.POST("/api/vehicles/{id}/deactivate", { params: { path: { id } } })),
  );

const EXPENSES = ["expense-items"] as const;

export function useExpenseItems() {
  return useQuery({ queryKey: EXPENSES, queryFn: () => unwrap(api.GET("/api/expense-items")) });
}

export const useSaveExpenseItem = () =>
  useInvalidating(EXPENSES, ({ id, name, direction }: { id?: number; name: string; direction: ExpenseItem["direction"] }) =>
    id
      ? unwrap(api.PUT("/api/expense-items/{id}", { params: { path: { id } }, body: { name } }))
      : unwrap(api.POST("/api/expense-items", { body: { name, direction } })),
  );

export const useToggleExpenseItem = () =>
  useInvalidating(EXPENSES, ({ id, active }: { id: number; active: boolean }) =>
    active
      ? unwrap(api.POST("/api/expense-items/{id}/activate", { params: { path: { id } } }))
      : unwrap(api.POST("/api/expense-items/{id}/deactivate", { params: { path: { id } } })),
  );
