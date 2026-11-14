import { describe, expect, it } from "vitest";
import { navigation } from "@/components/shell/nav";
import overrides from "@/messages/uz-Cyrl.overrides.json";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildCyrillic } from "./cyrl";
import { propertiesToCyrillic } from "./properties";
import { resolveLocale } from "./config";
import { ru, uzCyrl, uzLatn } from "./messages.generated";
import { toCyrillic, type Messages } from "./translit";

function keys(m: Messages, prefix = ""): string[] {
  return Object.entries(m)
    .flatMap(([k, v]) => (typeof v === "string" ? [prefix + k] : keys(v, `${prefix}${k}.`)))
    .sort();
}

describe("toCyrillic", () => {
  it.each([
    ["Bosh sahifa", "Бош саҳифа"],
    ["Yigʻish", "Йиғиш"],
    ["Joʻnatish", "Жўнатиш"],
    ["Yoʻq", "Йўқ"],
    ["Maʼlumotnomalar", "Маълумотномалар"],
    ["Inventarizatsiya", "Инвентаризация"],
    ["Yetkazib beruvchilar", "Етказиб берувчилар"],
    ["Elektron", "Электрон"],
    ["Shtrix-kod GS1", "Штрих-код GS1"],
    ["YB qarzi", "ЕБ қарзи"],
    ["U oʻchirilgan", "У ўчирилган"],
    ["MEDIX tizimi, Ctrl K", "MEDIX тизими, Ctrl K"],
    ["Excelʼga yuklash", "Excelʼга юклаш"],
    ["Saplaynʼda", "Саплайнъда"],
    ["Naqd, Terminal, Online", "Нақд, Терминал, Онлайн"],
    ["Hisobdan chiqarish (HC), YB ga toʻlov (YT)", "Ҳисобдан чиқариш (HC), ЕБ га тўлов (YT)"],
    ["Litsenziya, Retsept, Farmatsevtika, muddatsiz", "Лицензия, Рецепт, Фармацевтика, муддатсиз"],
  ])("%s → %s", (latin, cyr) => expect(toCyrillic(latin)).toBe(cyr));

  it("ICU argument va tanlov kalitlarini oʻzgartirmaydi", () => {
    expect(toCyrillic("{count} ta oʻqilmagan")).toBe("{count} та ўқилмаган");
    expect(toCyrillic("{n, plural, one {# ta yangi} other {# ta yangi}}")).toBe("{n, plural, one {# та янги} other {# та янги}}");
  });
});

describe("lugʻatlar", () => {
  it("uz-Cyrl uz-Latn dan yasalgan (pnpm i18n:cyrl)", () => {
    const fixes = overrides as Messages;
    for (const [ns, latin] of Object.entries(uzLatn)) {
      const extra = fixes[ns];
      expect(uzCyrl[ns as keyof typeof uzCyrl], ns).toEqual(buildCyrillic(latin, typeof extra === "object" ? extra : {}));
    }
  });

  it("backend messages_uz_Cyrl.properties messages.properties dan yasalgan (pnpm i18n:cyrl)", () => {
    const dir = join(process.cwd(), "../backend/src/main/resources");
    const latin = readFileSync(join(dir, "messages.properties"), "utf8");
    expect(readFileSync(join(dir, "messages_uz_Cyrl.properties"), "utf8")).toBe(propertiesToCyrillic(latin));
  });

  it("ru va uz-Latn kalitlari va oʻrinbosarlari bir xil", () => {
    expect(keys(ru)).toEqual(keys(uzLatn));
    const args = (v: string) => [...v.matchAll(/\{(\w+)/g)].map((m) => m[1]).sort();
    const flat = (m: Messages, p = ""): [string, string][] =>
      Object.entries(m).flatMap(([k, v]) => (typeof v === "string" ? [[p + k, v] as [string, string]] : flat(v, `${p}${k}.`)));
    const ruFlat = new Map(flat(ru));
    for (const [k, v] of flat(uzLatn)) expect(args(ruFlat.get(k) ?? ""), k).toEqual(args(v));
  });

  it("menyu nomlari lugʻatdagi bilan bir xil", () => {
    for (const g of navigation) {
      if (g.key) expect(uzLatn.navGroups[g.key]).toBe(g.title);
      for (const i of g.items) expect(uzLatn.nav[i.key]).toBe(i.label);
    }
  });

  it("notoʻgʻri cookie — asosiy til", () => {
    expect(resolveLocale("ru")).toBe("ru");
    expect(resolveLocale("en")).toBe("uz-Latn");
    expect(resolveLocale(undefined)).toBe("uz-Latn");
  });
});
