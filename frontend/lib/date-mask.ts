/**
 * Sana maydoni maskasi (egasi 13.11, O1): foydalanuvchi faqat raqam yozadi — 2- va 4-raqamdan keyin nuqta qoʻyiladi.
 * `11112026` → `11.11.2026`; joylashtirilgan `11.11.2026`, `2026-11-11`, `11/11/2026` ham toʻgʻri tushadi.
 * Oʻchirishda (matn qisqarganda) oxiridagi nuqta qayta qoʻyilmaydi — nuqta raqam bilan birga oʻchadi.
 */
export function maskUzDate(next: string, prev = ""): string {
  const raw = next.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(raw);
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`;
  const sep = /^(\d{1,2})[./\-\s](\d{1,2})[./\-\s](\d{4})$/.exec(raw);
  if (sep) return `${sep[1].padStart(2, "0")}.${sep[2].padStart(2, "0")}.${sep[3]}`;
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  const deleting = next.length < prev.length;
  let out = digits.slice(0, 2);
  if (digits.length > 2 || (digits.length === 2 && !deleting)) out += ".";
  out += digits.slice(2, 4);
  if (digits.length > 4 || (digits.length === 4 && !deleting)) out += ".";
  out += digits.slice(4, 8);
  return out;
}
