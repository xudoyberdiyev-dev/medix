import { apiUrl, isSessionExpired } from "./api-errors";
import { clearSession, getToken } from "./session";

// Server manzili yigʻish paytida beriladi: EXPO_PUBLIC_API_URL (CI: GitHub Variables → MOBILE_API_URL).
// Bu 100+ veb-sayt domeni — u /api/* ni backendga uzatadi.
export const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? "";

let locale = "uz-Latn";
export function setApiLocale(l: string): void {
  locale = l;
}

export type ApiProblem = { status: number; code?: string; detail?: string };

export class ApiError extends Error {
  constructor(readonly problem: ApiProblem) {
    super(problem.code ?? String(problem.status));
  }
}

/** Sessiya tugaganda chaqiriladi (ildiz layout login ekraniga yoʻnaltiradi). */
let onExpired: () => void = () => {};
export function setOnSessionExpired(fn: () => void): void {
  onExpired = fn;
}

export async function api<T>(path: string, init: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  if (!API_BASE) throw new ApiError({ status: 0, code: "config.apiUrl" });
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Accept-Language": locale === "ru" ? "ru" : "uz",
    Cookie: `YUZPLUS_LOCALE=${locale}`,
  };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (init.auth !== false) {
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  let res: Response;
  try {
    res = await fetch(apiUrl(API_BASE, path), {
      method: init.method ?? "GET",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError({ status: 0 });
  }
  if (res.status === 204) return undefined as T;
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const p = (data ?? {}) as { code?: string; detail?: string };
    const problem = { status: res.status, code: p.code, detail: p.detail };
    if (init.auth !== false && isSessionExpired(res.status, p.code)) {
      await clearSession();
      onExpired();
    }
    throw new ApiError(problem);
  }
  return data as T;
}
