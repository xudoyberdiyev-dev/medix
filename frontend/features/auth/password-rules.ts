/** Yangi parol talablari (prototip «Yangi parol oʻrnating»; backend `ChangePasswordRequest` bilan bir xil). */
export const MIN_PASSWORD = 8;

export type PasswordCheck = "length" | "digit" | "letter" | "different";
export const PASSWORD_CHECKS: readonly PasswordCheck[] = ["length", "digit", "letter", "different"];

export function passwordChecks(pw: string, current: string): Record<PasswordCheck, boolean> {
  return {
    length: pw.length >= MIN_PASSWORD,
    digit: /\d/.test(pw),
    letter: /\p{L}/u.test(pw),
    different: pw !== "" && pw !== current,
  };
}

export function passwordValid(pw: string, current: string): boolean {
  const c = passwordChecks(pw, current);
  return PASSWORD_CHECKS.every((k) => c[k]);
}

/** Kuch: 0 — boʻsh, 1 Zaif … 4 Kuchli (uzunlik, raqam, harf, katta-kichik yoki belgi, 12+ belgi). */
export function passwordScore(pw: string): 0 | 1 | 2 | 3 | 4 {
  if (!pw) return 0;
  const points = [
    pw.length >= MIN_PASSWORD,
    /\d/.test(pw),
    /\p{L}/u.test(pw),
    (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) || /[^\p{L}\d]/u.test(pw),
    pw.length >= 12,
  ].filter(Boolean).length;
  return Math.min(4, Math.max(1, points)) as 1 | 2 | 3 | 4;
}
