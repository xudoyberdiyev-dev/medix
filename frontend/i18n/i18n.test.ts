import { describe, expect, it } from "vitest";
import { navigation } from "@/components/shell/nav";
import ru from "@/messages/ru.json";
import overrides from "@/messages/uz-Cyrl.overrides.json";
import uzCyrl from "@/messages/uz-Cyrl.json";
import uzLatn from "@/messages/uz-Latn.json";
import { buildCyrillic } from "./cyrl";
import { resolveLocale } from "./config";
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
    ["MEDIX tizimi, Ctrl K", "MEDIX тизими, Ctrl K"],
  ])("%s → %s", (latin, cyr) => expect(toCyrillic(latin)).toBe(cyr));

  it("ICU argument va tanlov kalitlarini oʻzgartirmaydi", () => {
    expect(toCyrillic("{count} ta oʻqilmagan")).toBe("{count} та ўқилмаган");
    expect(toCyrillic("{n, plural, one {# ta yangi} other {# ta yangi}}")).toBe("{n, plural, one {# та янги} other {# та янги}}");
  });
});

describe("lugʻatlar", () => {
  it("uz-Cyrl uz-Latn dan yasalgan (pnpm i18n:cyrl)", () => {
    expect(uzCyrl).toEqual(buildCyrillic(uzLatn, overrides));
  });

  it("ru va uz-Latn kalitlari bir xil", () => {
    expect(keys(ru)).toEqual(keys(uzLatn));
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
