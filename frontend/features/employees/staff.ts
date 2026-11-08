import type { Employee } from "./api";

/** Telefon: +998 XX XXX XX XX (prototip WizStaff). */
export const PHONE_RE = /^\+998 \d{2} \d{3} \d{2} \d{2}$/;

export function formatPhone(v: string): string {
  let d = String(v || "").replace(/\D/g, "");
  if (d.startsWith("998")) d = d.slice(3);
  d = d.slice(0, 9);
  const p = [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean);
  return "+998" + (p.length ? " " + p.join(" ") : "");
}

/** Loginda faqat kichik lotin harflari, raqam, nuqta va pastki chiziq. */
export function cleanLogin(v: string): string {
  return v.toLowerCase().replace(/[^a-z0-9._]/g, "");
}

const PW_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

/** 10 belgili bir martalik parol (oʻxshash belgilarsiz); kamida bitta harf va bitta raqam boʻladi. */
export function generatePassword(random: (n: number) => number = cryptoRandom): string {
  for (;;) {
    let o = "";
    for (let i = 0; i < 10; i++) o += PW_ALPHABET[random(PW_ALPHABET.length)];
    if (/\d/.test(o) && /[A-Za-z]/.test(o)) return o;
  }
}

function cryptoRandom(n: number): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return (a[0] ?? 0) % n;
}

export type StaffStatus = "new" | "active" | "blocked";

/** Holat: bloklangan; hali kirmagan («Yangi» — parol bir martalik); faol. */
export function staffStatus(e: Pick<Employee, "status" | "lastLoginAt">): StaffStatus {
  if (e.status === "BLOCKED") return "blocked";
  return e.lastLoginAt ? "active" : "new";
}

/** «Ism Familiya» (qismlar boʻlmasa — toʻliq ism). */
export function displayName(e: Pick<Employee, "firstName" | "lastName" | "fullName">): string {
  return e.firstName && e.lastName ? `${e.firstName} ${e.lastName}` : e.fullName;
}

export function initials(e: Pick<Employee, "firstName" | "lastName" | "fullName">): string {
  if (e.firstName && e.lastName) return (e.firstName[0] ?? "") + (e.lastName[0] ?? "");
  const p = e.fullName.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase();
}

export interface StaffForm {
  last: string;
  first: string;
  mid: string;
  phone: string;
  role: string;
  branch: string;
  whs: number[];
  cash: number[];
  login: string;
  loginTouched: boolean;
}

export type StaffErrorKey = "last" | "first" | "phone" | "role" | "branch" | "login" | "limit";

export interface CheckInput {
  form: StaffForm;
  id: number | null;
  /** Rol doirasi: «all» — filial tanlanmaydi. */
  scope: (role: string) => "all" | "own";
  loginBusy: boolean;
  seats: { used: number; limit?: number | null };
  employees: Employee[];
}

/** Prototip WizStaff `check()`: xatolar (saqlashni toʻxtatadi) va ogohlantirishlar (tasdiq bilan davom etadi). */
export function checkStaff(i: CheckInput): { errors: StaffErrorKey[]; dupPhone: Employee | null } {
  const f = i.form;
  const errors: StaffErrorKey[] = [];
  if (!f.last.trim()) errors.push("last");
  if (!f.first.trim()) errors.push("first");
  if (!PHONE_RE.test(f.phone)) errors.push("phone");
  if (!f.role) errors.push("role");
  else if (i.scope(f.role) !== "all" && !f.branch) errors.push("branch");
  if (!f.login || i.loginBusy) errors.push("login");
  if (i.id === null && i.seats.limit && i.seats.used >= i.seats.limit) errors.push("limit");
  const dupPhone = PHONE_RE.test(f.phone)
    ? (i.employees.find((e) => e.id !== i.id && e.status !== "BLOCKED" && e.phone === f.phone) ?? null)
    : null;
  return { errors, dupPhone };
}

export type StaffView = "all" | "never" | "blocked" | "week";
export const STAFF_VIEWS: StaffView[] = ["all", "never", "blocked", "week"];

/** Prototip AdminStaff koʻrinishlari: hammasi / hech kirmagan / bloklangan / 7 kunda kirmagan. */
export function inView(e: Pick<Employee, "status" | "lastLoginAt">, v: StaffView, weekAgo: number): boolean {
  if (v === "never") return !e.lastLoginAt;
  if (v === "blocked") return e.status === "BLOCKED";
  if (v === "week") return !(e.lastLoginAt && new Date(e.lastLoginAt).getTime() >= weekAgo);
  return true;
}
