import { ApiError } from "@/lib/api/client";
import { NETWORK_ERROR } from "@/lib/api/errors";

/** Mutatsiya xatosidan: umumiy matn (Alert uchun) va maydon xatolari. */
export function describeError(error: unknown): { message: string | null; fields: Record<string, string> } {
  if (!error) return { message: null, fields: {} };
  if (error instanceof ApiError) {
    const hasFields = Object.keys(error.fieldErrors).length > 0;
    return { message: hasFields ? null : error.message, fields: error.fieldErrors };
  }
  return { message: NETWORK_ERROR, fields: {} };
}
