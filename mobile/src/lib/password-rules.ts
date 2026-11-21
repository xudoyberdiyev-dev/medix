// Yangi parol qoidalari (server bilan bir xil: 8–128 belgi, kamida bitta harf va bitta raqam) — sof mantiq, birlik testlari bilan.
export type PasswordProblem = "short" | "chars" | "same" | "mismatch";

export function newPasswordProblem(next: string, repeat: string, current: string): PasswordProblem | null {
  if (next.length < 8 || next.length > 128) return "short";
  if (!/\p{L}/u.test(next) || !/\d/.test(next)) return "chars";
  if (next === current) return "same";
  if (next !== repeat) return "mismatch";
  return null;
}
