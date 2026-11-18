import { describe, expect, it } from "vitest";
import {
  DRAFT_BACKUP_TTL_MS,
  OPEN_DRAFT_TTL_MS,
  draftBackupKey,
  draftFormFor,
  parseDraftBackup,
  parseOpenDraft,
  readDraftBackup,
  writeDraftBackup,
} from "./open-draft";

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

describe("qoralama zaxirasi (U11, localStorage)", () => {
  it("kalit foydalanuvchi va hujjat boʻyicha alohida", () => {
    expect(draftBackupKey(3, null)).toBe("yuzplus-order-backup:3:new");
    expect(draftBackupKey(3, 12)).not.toBe(draftBackupKey(4, 12));
  });

  it("yangi zaxira tiklanadi, eskisi va buzugʻi tashlanadi", () => {
    expect(parseDraftBackup(JSON.stringify({ form, at: now - 1000 }), now)?.form.lines).toHaveLength(1);
    expect(parseDraftBackup(JSON.stringify({ form, at: now - DRAFT_BACKUP_TTL_MS - 1 }), now)).toBeNull();
    expect(parseDraftBackup(JSON.stringify({ form: { a: 1 }, at: now }), now)).toBeNull();
    expect(parseDraftBackup("{", now)).toBeNull();
    expect(parseDraftBackup(null, now)).toBeNull();
  });

  it("yozish, oʻqish va oʻchirish — boshqa foydalanuvchiga koʻrinmaydi", () => {
    localStorage.clear();
    writeDraftBackup(5, 9, form);
    expect(readDraftBackup(5, 9)?.form.customer).toBe("4");
    expect(readDraftBackup(6, 9)).toBeNull();
    expect(readDraftBackup(5, null)).toBeNull();
    writeDraftBackup(5, 9, null);
    expect(readDraftBackup(5, 9)).toBeNull();
  });
});
