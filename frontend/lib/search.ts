/**
 * Qidiruv normalizatsiyasi (SPEC 2: qidiruv lotin va kirillda bir xil ishlaydi).
 * Kirill → lotin, kichik harf, tutuq belgilari (ʻ ʼ ' ` ‘ ’) olib tashlanadi: «Ғалла» ≈ «gʻalla» ≈ «galla».
 * Dori nomlari uchun ikkala tomonda: «ts» → «c», «ks» → «x», «kh» → «x» («Парацетамол» ≈ «paracetamol»,
 * «Ципрофлоксацин» ≈ «ciprofloxacin»).
 */
const CYR: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  ғ: "g",
  д: "d",
  е: "e",
  ё: "yo",
  ж: "j",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  қ: "q",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ў: "o",
  ф: "f",
  х: "x",
  ҳ: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sh",
  ъ: "",
  ы: "i",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

export function normalizeSearch(text: string): string {
  let out = "";
  for (const ch of text.toLocaleLowerCase("uz")) out += CYR[ch] ?? ch;
  return out
    .replace(/[ʻʼ'`‘’]/g, "")
    .replace(/ts/g, "c")
    .replace(/ks|kh/g, "x")
    .replace(/\s+/g, " ")
    .trim();
}

/** Har bir soʻz qatorning biror maydonida uchrasa — mos (tartibi muhim emas). */
export function matchesSearch(query: string, fields: (string | null | undefined)[]): boolean {
  const q = normalizeSearch(query);
  if (!q) return true;
  const hay = normalizeSearch(fields.filter(Boolean).join(" "));
  return q.split(" ").every((w) => hay.includes(w));
}
