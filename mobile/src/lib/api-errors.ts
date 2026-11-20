// Server xatosini ilova xato turiga aylantirish (sof mantiq — birlik testlari bilan).
export type LoginErrorKind = "credentials" | "locked" | "role" | "passwordChange" | "blocked" | "network";

export function loginErrorKind(status: number, code: string | undefined): LoginErrorKind {
  if (code === "mobile.driverOnly") return "role";
  if (code === "mobile.passwordChangeRequired") return "passwordChange";
  if (code === "auth.blocked") return "blocked";
  if (code === "auth.locked" || status === 429) return "locked";
  if (status === 401 || status === 400 || (code ?? "").startsWith("auth.badCredentials")) return "credentials";
  return "network";
}

/** Bearer token yaroqsiz — ilova sessiyani tozalab, login ekraniga qaytadi. */
export function isSessionExpired(status: number, code: string | undefined): boolean {
  return status === 401 && (code === "mobile.tokenInvalid" || code === "auth.unauthorized");
}

export function apiUrl(base: string, path: string): string {
  return base.replace(/\/+$/, "") + path;
}
