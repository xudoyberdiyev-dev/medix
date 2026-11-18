import { TIME_ZONE } from "@/i18n/config";

/** Toshkent vaqtidagi soat (0–23). */
export function tashkentHour(d: Date): number {
  const h = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour: "2-digit", hourCycle: "h23" }).format(d);
  return Number(h);
}

/** Vaqtga qarab salom: 05–11 — tong, 12–17 — kun, qolgani — kech (Asia/Tashkent). */
export function greetingKey(d: Date): "greetingMorning" | "greetingDay" | "greetingEvening" {
  const h = tashkentHour(d);
  if (h >= 5 && h < 12) return "greetingMorning";
  if (h >= 12 && h < 18) return "greetingDay";
  return "greetingEvening";
}

const UZ_LATN_MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
const UZ_LATN_DAYS = ["Yakshanba", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba"];
const UZ_CYRL_MONTHS = ["январ", "феврал", "март", "апрел", "май", "июн", "июл", "август", "сентабр", "октабр", "ноябр", "декабр"];
const UZ_CYRL_DAYS = ["Якшанба", "Душанба", "Сешанба", "Чоршанба", "Пайшанба", "Жума", "Шанба"];

/** «Chorshanba, 18-noyabr» / «Чоршанба, 18-ноябр» / «Среда, 18 ноября» — Toshkent sanasi, tanlangan tilda. */
export function longDate(d: Date, locale: string): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, day: "numeric", month: "numeric", weekday: "short" })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  const day = Number(p.day);
  const month = Number(p.month) - 1;
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  if (locale === "ru") {
    const s = new Intl.DateTimeFormat("ru-RU", { timeZone: TIME_ZONE, weekday: "long", day: "numeric", month: "long" }).format(d);
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  if (locale === "uz-Cyrl") return `${UZ_CYRL_DAYS[wd]}, ${day}-${UZ_CYRL_MONTHS[month]}`;
  return `${UZ_LATN_DAYS[wd]}, ${day}-${UZ_LATN_MONTHS[month]}`;
}
