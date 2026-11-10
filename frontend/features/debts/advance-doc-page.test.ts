import { describe, expect, it } from "vitest";
import type { DocRow } from "@/features/payments/doc-model";
import { checkAdvance } from "./advance-doc-page";

const d = (id: number, open: string): DocRow => ({
  docType: "SV",
  docId: id,
  docNumber: `SV-${id}`,
  date: "2026-11-01",
  open,
  overdueDays: 0,
  total: open,
  returned: "0.00",
  paid: "0.00",
});

describe("avansni hisobga olish tekshiruvi", () => {
  const docs = [d(1, "3000.00"), d(2, "2000.00")];
  it("boʻsh taqsimot", () => {
    expect(checkAdvance(docs, {}, "1000.00").errors.map((e) => e.key)).toEqual(["eEmpty"]);
  });
  it("avansdan va qoldiqdan oshish", () => {
    const r = checkAdvance(docs, { "SV:1": "3000.00", "SV:2": "2500.00" }, "4000.00");
    expect(r.total).toBe("5500.00");
    expect(r.errors.map((e) => e.key)).toEqual(["eOver", "eRow"]);
    expect(r.errors[1].n).toBe("SV-2");
  });
  it("toʻgʻri taqsimot", () => {
    expect(checkAdvance(docs, { "SV:2": "500.00" }, "4000.00")).toMatchObject({ total: "500.00", errors: [] });
  });
});
