import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import { uzLatn } from "@/i18n/messages.generated";
import type { BranchSaleSummary } from "@/features/branch-sales/api";
import { incomingBranchSales, keeperTabs } from "./monitor-page";

const t = createTranslator({ locale: "uz-Latn", messages: uzLatn, namespace: "orders" });

describe("Ombor mudiri paneli yorliqlari", () => {
  it("ruxsatga qarab: kirim qabuli va qaytgan tovar faqat ruxsat bilan", () => {
    expect(keeperTabs({ waitingTime: 2, receipts: false, returns: false }, t).map((t) => t.key)).toEqual(["monitor", "time", "issues"]);
    const all = keeperTabs({ waitingTime: 0, receipts: true, returns: true, receiptCount: 3 }, t);
    expect(all.map((t) => t.key)).toEqual(["monitor", "time", "issues", "receipts", "returns"]);
    expect(all.find((t) => t.key === "receipts")?.count).toBe(3);
    expect(all.find((t) => t.key === "time")?.count).toBe(0);
    const withTransfers = keeperTabs({ waitingTime: 0, receipts: true, returns: true, transfers: true, transferCount: 2 }, t);
    expect(withTransfers.map((t) => t.key)).toEqual(["monitor", "time", "issues", "receipts", "transfers", "returns"]);
    expect(withTransfers.find((t) => t.key === "transfers")?.count).toBe(2);
  });
});

describe("Koʻchirish qabuli — filiallararo savdo", () => {
  const fs = (id: number, buyer: number, status: "IN_TRANSIT" | "RECEIVED" = "IN_TRANSIT") =>
    ({ id, status, buyer: { id: buyer, code: "B", name: "B" } }) as unknown as BranchSaleSummary;
  it("faqat shu filial xaridor boʻlgan yoʻldagi FS", () => {
    const rows = [fs(1, 5), fs(2, 6), fs(3, 5, "RECEIVED")];
    expect(incomingBranchSales(rows, 5).map((d) => d.id)).toEqual([1]);
    expect(incomingBranchSales(rows, null).map((d) => d.id)).toEqual([1, 2]);
  });
});
