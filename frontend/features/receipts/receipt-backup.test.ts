import { describe, expect, it } from "vitest";
import {
  RECEIPT_BACKUP_TTL_MS,
  type ReceiptBackupForm,
  parseReceiptBackup,
  readReceiptBackup,
  receiptBackupKey,
  worthBackup,
  writeReceiptBackup,
} from "./receipt-backup";

const form: ReceiptBackupForm = {
  warehouseId: "1",
  supplier: "3",
  supplierLabel: "Nika Pharm",
  date: "19.11.2026",
  invoice: "N-15",
  invoiceDate: "",
  paymentType: "TRANSFER",
  due: "",
  owner: null,
  prepaid: false,
  discountKind: null,
  discountValue: "",
  discountDate: "",
  note: "",
  factura: "",
  lines: [
    {
      productId: 7,
      productCode: "P-7",
      productName: "Paracetamol",
      batchNumber: "A1",
      producedOn: "01.01.2026",
      expiryDate: "01.01.2028",
      zoneId: 2,
      qty: "100",
      bonusQty: "",
      price: "1 250,00",
    },
  ],
};
const now = 1_800_000_000_000;
const empty: ReceiptBackupForm = { ...form, supplier: null, invoice: "", lines: [] };

describe("yangi kirim qoralamasi zaxirasi (U11)", () => {
  it("boʻsh forma eslab qolinmaydi", () => {
    expect(worthBackup(form)).toBe(true);
    expect(worthBackup(empty)).toBe(false);
    expect(worthBackup({ ...empty, invoice: "N-1" })).toBe(true);
  });

  it("tiklash: yangisi qaytadi, eskisi, buzugʻi va notoʻgʻri qatorlar tashlanadi", () => {
    expect(parseReceiptBackup(JSON.stringify({ form, at: now - 1000 }), now)?.form.lines).toHaveLength(1);
    expect(parseReceiptBackup(JSON.stringify({ form, at: now - RECEIPT_BACKUP_TTL_MS - 1 }), now)).toBeNull();
    expect(parseReceiptBackup(JSON.stringify({ form: { ...form, prepaid: "ha" }, at: now }), now)).toBeNull();
    const badLine = { ...form, lines: [...form.lines, { productId: "x" }] };
    expect(parseReceiptBackup(JSON.stringify({ form: badLine, at: now }), now)?.form.lines).toHaveLength(1);
    expect(parseReceiptBackup("{", now)).toBeNull();
  });

  it("foydalanuvchi boʻyicha alohida; boʻsh yoki null yozish oʻchiradi", () => {
    localStorage.clear();
    writeReceiptBackup(4, form);
    expect(localStorage.getItem(receiptBackupKey(4))).not.toBeNull();
    expect(readReceiptBackup(4)?.form.supplierLabel).toBe("Nika Pharm");
    expect(readReceiptBackup(5)).toBeNull();
    writeReceiptBackup(4, empty);
    expect(readReceiptBackup(4)).toBeNull();
    writeReceiptBackup(4, form);
    writeReceiptBackup(4, null);
    expect(localStorage.getItem(receiptBackupKey(4))).toBeNull();
  });
});
