/** Spring Security `CookieCsrfTokenRepository` cookie va sarlavha nomlari. */
export const CSRF_COOKIE = "XSRF-TOKEN";
export const CSRF_HEADER = "X-XSRF-TOKEN";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS", "TRACE"]);

export function needsCsrf(method: string): boolean {
  return !SAFE_METHODS.has(method.toUpperCase());
}

export function readCookie(cookieString: string, name: string): string | undefined {
  for (const part of cookieString.split(";")) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (rawKey === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}
