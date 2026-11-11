import { describe, expect, it } from "vitest";
import { autoMap, mapFromProfile, mappingProblems, normHeader } from "@/features/products/import-model";
import { CUSTOMER_FIELDS, SUPPLIER_FIELDS, checkColumns, importFields, messageField, templateRows } from "./import-fields";

describe("kontragent import maydonlari", () => {
  it("mijoz va YB maydonlari prototip boʻyicha, chegirmasiz", () => {
    expect(CUSTOMER_FIELDS.map((f) => f.key)).toEqual(["stir", "cname", "ctype", "region", "address", "phone", "limit", "days"]);
    expect(SUPPLIER_FIELDS.map((f) => f.key)).toEqual(["stir", "cname", "region", "address", "phone", "days", "lead"]);
    expect(importFields("SUPPLIER")).toBe(SUPPLIER_FIELDS);
    expect(checkColumns("CUSTOMER").slice(-2)).toEqual(["match", "msg"]);
  });

  it("SmartUp/rus sarlavhalari avtomatik moslashadi", () => {
    const headers = ["ИНН", "Наименование", "Тип", "Регион", "Адрес", "Телефон", "Лимит", "Отсрочка (дней)"];
    expect(autoMap(CUSTOMER_FIELDS, headers)).toEqual({ stir: 0, cname: 1, ctype: 2, region: 3, address: 4, phone: 5, limit: 6, days: 7 });
    expect(autoMap(SUPPLIER_FIELDS, ["STIR", "Nomi", "Srok postavki"])).toEqual({ stir: 0, cname: 1, lead: 2 });
    expect(normHeader("Отсрочка")).toBe("ocrochka");
  });

  it("shablon sarlavhalari qayta yuklanganda toʻliq taniladi (lotin, kirill, rus)", () => {
    const sets: Record<string, string>[] = [
      {
        stir: "STIR",
        cname: "Nomi",
        ctype: "Turi",
        region: "Hudud",
        address: "Manzil",
        phone: "Telefon",
        limit: "Kredit limiti",
        days: "Toʻlov muddati (kun)",
        lead: "Yetkazish muddati (kun)",
      },
      {
        stir: "СТИР",
        cname: "Номи",
        ctype: "Тури",
        region: "Ҳудуд",
        address: "Манзил",
        phone: "Телефон",
        limit: "Кредит лимити",
        days: "Тўлов муддати (кун)",
        lead: "Етказиш муддати (кун)",
      },
      {
        stir: "ИНН",
        cname: "Наименование",
        ctype: "Тип",
        region: "Регион",
        address: "Адрес",
        phone: "Телефон",
        limit: "Лимит",
        days: "Отсрочка (дней)",
        lead: "Срок поставки (дней)",
      },
    ];
    for (const labels of sets) {
      for (const role of ["CUSTOMER", "SUPPLIER"] as const) {
        const [row] = templateRows(role, (k) => labels[k]);
        expect(Object.keys(autoMap(importFields(role), row))).toHaveLength(importFields(role).length);
      }
    }
  });

  it("majburiy maydonlar va profil", () => {
    expect(mappingProblems(CUSTOMER_FIELDS, { cname: 0 }).missing).toEqual(["stir"]);
    expect(mappingProblems(SUPPLIER_FIELDS, { stir: 0, cname: 0 }).dup).toEqual(["cname"]);
    expect(mapFromProfile({ stir: "INN", limit: "Limit" }, ["INN", "Limit"], SUPPLIER_FIELDS)).toEqual({ stir: 0 });
  });

  it("xato izohi katakka bogʻlanadi", () => {
    expect(messageField("cTinTaken", { n: "X" })).toBe("stir");
    expect(messageField("cDaysBad", { f: "lead", t: "x" })).toBe("lead");
    expect(messageField("cBranchReq", {})).toBeNull();
  });
});
