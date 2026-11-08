/**
 * Vaqtinchalik parol — faqat xotirada (sahifa yangilansa yoʻqoladi, hech qayerga yozilmaydi): login sahifasidan
 * «Yangi parol oʻrnating» ga oʻtganda qayta soʻramaslik uchun. Yoʻq boʻlsa, sahifa «Joriy parol» maydonini koʻrsatadi.
 */
let tempPassword: string | null = null;

export function rememberTempPassword(password: string | null): void {
  tempPassword = password;
}

export function tempPasswordValue(): string | null {
  return tempPassword;
}
