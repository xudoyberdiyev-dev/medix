import { describe, expect, it } from "vitest";
import { OPEN_DRAFT_TTL_MS, draftFormFor, parseOpenDraft } from "./open-draft";

const form = {
  warehouseId: "1",
  customer: "4",
  customerLabel: "Shifo",
  deliveryType: "DELIVERY",
  deliveryDate: "08.11.2026",
  address: "",
  paymentType: "CASH",
  note: "",
  lines: [{ productId: 7, productCode: "P-7", productName: "Paracetamol", qty: "10" }],
};
const now = 1_800_000_000_000;

describe("ochiq hujjat (SPEC 208)", () => {
  it("yangi buyurtma formasi tiklanadi", () => {
    const d = parseOpenDraft(JSON.stringify({ id: null, form, at: now - 1000 }), now);
    expect(d).toEqual({ id: null, form, at: now - 1000 });
    expect(draftFormFor(d, null)).toEqual(form);
    expect(draftFormFor(d, 5)).toBeNull();
  });

  it("saqlangan qoralama — formasiz ham ochiladi", () => {
    const d = parseOpenDraft(JSON.stringify({ id: 5, form: null, at: now }), now);
    expect(d?.id).toBe(5);
    expect(draftFormFor(d, 5)).toBeNull();
  });

  it("eski, buzilgan yoki boʻsh yozuv tashlanadi", () => {
    expect(parseOpenDraft(JSON.stringify({ id: 5, form: null, at: now - OPEN_DRAFT_TTL_MS - 1 }), now)).toBeNull();
    expect(parseOpenDraft("{", now)).toBeNull();
    expect(parseOpenDraft(JSON.stringify({ id: null, form: null, at: now }), now)).toBeNull();
    expect(parseOpenDraft(JSON.stringify({ id: -1, form: null, at: now }), now)).toBeNull();
    expect(parseOpenDraft(null, now)).toBeNull();
  });

  it("notoʻgʻri qatorlar olib tashlanadi", () => {
    const bad = { ...form, lines: [...form.lines, { productId: "x", qty: 1 }] };
    expect(parseOpenDraft(JSON.stringify({ id: null, form: bad, at: now }), now)?.form?.lines).toHaveLength(1);
  });
});
