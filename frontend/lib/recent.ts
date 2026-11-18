/**
 * U6: oxirgi ochilgan sahifa/hujjatlar (Ctrl+K «Oxirgi ochilganlar»). Brauzer xotirasida, foydalanuvchi qulayligi uchun;
 * xotira boʻlmasa (maxfiy oyna) — jimgina boʻsh.
 */
export const RECENT_KEY = "yuzplus.recent";
export const MAX_RECENT = 10;
const SKIP = new Set(["/", "/login", "/profile"]);

export function pushRecent(list: string[], path: string): string[] {
  if (SKIP.has(path) || !path.startsWith("/")) return list;
  return [path, ...list.filter((p) => p !== path)].slice(0, MAX_RECENT);
}

export function parseRecent(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    return Array.isArray(data) ? data.filter((p): p is string => typeof p === "string" && p.startsWith("/")).slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

export function readRecent(): string[] {
  try {
    return parseRecent(window.localStorage.getItem(RECENT_KEY));
  } catch {
    return [];
  }
}

export function recordRecent(path: string): void {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(pushRecent(readRecent(), path)));
  } catch {
    // xotira yoʻq — eslab qolinmaydi
  }
}
