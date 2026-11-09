import type { components } from "@/lib/api/schema";

type Branch = components["schemas"]["Branch"];
export type BranchBody = components["schemas"]["CreateBranchRequest"];

/** Viloyat / shahar (prototip BranchPanel). */
export const REGIONS = [
  "Toshkent shahri",
  "Toshkent viloyati",
  "Samarqand viloyati",
  "Buxoro viloyati",
  "Fargʻona viloyati",
  "Andijon viloyati",
  "Namangan viloyati",
  "Qashqadaryo viloyati",
  "Surxondaryo viloyati",
  "Jizzax viloyati",
  "Sirdaryo viloyati",
  "Navoiy viloyati",
  "Xorazm viloyati",
  "Qoraqalpogʻiston Respublikasi",
] as const;

/** Banklar va MFO (bank tanlansa MFO avtomatik). */
export const BANKS: readonly { name: string; mfo: string }[] = [
  { name: "Kapitalbank", mfo: "01158" },
  { name: "Hamkorbank", mfo: "00083" },
  { name: "Ipoteka bank", mfo: "00423" },
  { name: "Asakabank", mfo: "00873" },
  { name: "Agrobank", mfo: "00394" },
  { name: "Oʻzmilliybank", mfo: "00450" },
];

export interface BankRow {
  bankName: string;
  mfo: string;
  account: string;
  main: boolean;
}

export interface BranchForm {
  name: string;
  code: string;
  legalName: string;
  tin: string;
  vatPayer: boolean;
  vatCertNo: string;
  region: string;
  address: string;
  sameAddress: boolean;
  actualAddress: string;
  phone: string;
  banks: BankRow[];
  directorName: string;
  accountantName: string;
}

export const emptyBank = (main = false): BankRow => ({ bankName: "", mfo: "", account: "", main });

export function formFromBranch(b?: Branch | null): BranchForm {
  const banks = b?.bankAccounts.length ? b.bankAccounts.map((a) => ({ ...a })) : [emptyBank(true)];
  return {
    name: b?.name ?? "",
    code: b?.code ?? "",
    legalName: b?.legalName ?? "",
    tin: b?.tin ?? "",
    vatPayer: b?.vatPayer ?? true,
    vatCertNo: b?.vatCertNo ?? "",
    region: b?.region ?? "",
    address: b?.address ?? "",
    sameAddress: !b?.actualAddress || b.actualAddress === b.address,
    actualAddress: b?.actualAddress ?? "",
    phone: b?.phone ?? "",
    banks,
    directorName: b?.directorName ?? "",
    accountantName: b?.accountantName ?? "",
  };
}

const CYR: Record<string, string> = {
  а: "A",
  б: "B",
  в: "V",
  г: "G",
  д: "D",
  е: "E",
  ё: "Y",
  ж: "J",
  з: "Z",
  и: "I",
  й: "Y",
  к: "K",
  л: "L",
  м: "M",
  н: "N",
  о: "O",
  п: "P",
  р: "R",
  с: "S",
  т: "T",
  у: "U",
  ф: "F",
  х: "X",
  ц: "S",
  ч: "CH",
  ш: "SH",
  щ: "SH",
  ы: "I",
  э: "E",
  ю: "Y",
  я: "Y",
  ў: "O",
  қ: "Q",
  ғ: "G",
  ҳ: "H",
};

/** Nomdan 3 harfli belgi: undoshlar ustun («Toshkent filiali» → TSH, «Samarqand» → SMR). */
export function suggestCode(name: string): string {
  const word = name.trim().split(/\s+/)[0] ?? "";
  const latin = [...word.toLowerCase()]
    .map((ch) => CYR[ch] ?? ch.toUpperCase())
    .join("")
    .replace(/[^A-Z]/g, "");
  if (!latin) return "";
  const head = latin[0];
  const consonants = latin.slice(1).replace(/[AEIOU]/g, "");
  const code = (head + consonants).length >= 3 ? (head + consonants).slice(0, 3) : latin.slice(0, 3);
  return code.length === 3 ? code : "";
}

export type BranchErrors = Partial<Record<string, string>>;
export type ErrorKey = "eName" | "eCode" | "eLegal" | "eStir" | "eRegion" | "eAddr" | "eActual" | "eBank" | "eAcc" | "eVatNo";

/** Maydon → xato kaliti (`branchPanel.<kalit>`). Toʻliq boʻsh bank qatori eʼtiborga olinmaydi. */
export function validateBranch(f: BranchForm, isNew: boolean): Record<string, ErrorKey> {
  const e: Record<string, ErrorKey> = {};
  if (!f.name.trim()) e.name = "eName";
  if (isNew && !/^[A-Za-z]{2,4}$/.test(f.code.trim())) e.code = "eCode";
  if (!f.legalName.trim()) e.legalName = "eLegal";
  if (!/^\d{9}$/.test(f.tin.trim())) e.tin = "eStir";
  if (f.vatPayer && f.vatCertNo.trim() && !/^\d{6,20}$/.test(f.vatCertNo.trim())) e.vatCertNo = "eVatNo";
  if (!f.region) e.region = "eRegion";
  if (!f.address.trim()) e.address = "eAddr";
  if (!f.sameAddress && !f.actualAddress.trim()) e.actualAddress = "eActual";
  f.banks.forEach((b, i) => {
    if (!b.bankName && !b.account.trim()) return;
    if (!b.bankName) e[`bank.${i}`] = "eBank";
    if (!/^\d{20}$/.test(b.account.trim())) e[`account.${i}`] = "eAcc";
  });
  return e;
}

const nul = (s: string) => (s.trim() ? s.trim() : undefined);

export function bodyFromForm(f: BranchForm): BranchBody {
  const banks = f.banks.filter((b) => b.bankName || b.account.trim());
  return {
    code: f.code.trim().toUpperCase(),
    name: f.name.trim(),
    legalName: f.legalName.trim(),
    tin: f.tin.trim(),
    address: nul(f.address),
    phone: nul(f.phone),
    vatPayer: f.vatPayer,
    vatCertNo: f.vatPayer ? nul(f.vatCertNo) : undefined,
    region: nul(f.region),
    actualAddress: f.sameAddress ? nul(f.address) : nul(f.actualAddress),
    directorName: nul(f.directorName),
    accountantName: nul(f.accountantName),
    bankAccounts: banks.map((b) => ({ bankName: b.bankName, mfo: b.mfo, account: b.account.trim(), main: b.main })),
  };
}
