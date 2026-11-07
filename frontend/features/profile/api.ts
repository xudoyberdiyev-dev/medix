"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ensureCsrf } from "@/features/auth/session";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

export type Profile = components["schemas"]["Profile"];

const KEY = ["profile"] as const;

export function useProfile() {
  return useQuery({ queryKey: KEY, queryFn: () => unwrap(api.GET("/api/profile")) });
}

export function useUpdatePhone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (phone: string) => {
      await ensureCsrf();
      return unwrap(api.PUT("/api/profile", { body: { phone: phone.trim() || undefined } }));
    },
    onSuccess: (p) => qc.setQueryData(KEY, p),
  });
}

export function useSetPin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { currentPassword: string; pin: string }) => {
      await ensureCsrf();
      await unwrap(api.PUT("/api/profile/pin", { body }));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/**
 * PIN shakli tekshiruvi (server ham tekshiradi): 4–6 raqam, 1111 / 1234 / 4321 kabi oson emas, takrori mos.
 * Xato boʻlsa — `profile.pin.errors.<kalit>`.
 */
export type PinErrorKey = "format" | "easy" | "mismatch";

export function validatePin(pin: string, repeat: string): { pin?: PinErrorKey; repeat?: PinErrorKey } {
  if (!/^\d{4,6}$/.test(pin)) return { pin: "format" };
  const digits = [...pin].map(Number);
  const same = digits.every((d) => d === digits[0]);
  const up = digits.every((d, i) => i === 0 || d - digits[i - 1] === 1);
  const down = digits.every((d, i) => i === 0 || d - digits[i - 1] === -1);
  if (same || up || down) return { pin: "easy" };
  if (pin !== repeat) return { repeat: "mismatch" };
  return {};
}
