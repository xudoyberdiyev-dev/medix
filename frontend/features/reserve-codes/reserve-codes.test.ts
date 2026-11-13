import { describe, expect, it } from "vitest";
import { verifyExportUrl } from "@/features/orders/api";
import { reserveExportUrl } from "./api";

describe("O10: zaxira kodlar va Saplayn eksporti", () => {
  it("Excel manzili joriy filtrlardan (boʻsh qiymatlar tashlanadi)", () => {
    expect(reserveExportUrl({ status: null, branchId: null, from: null, to: null, q: " " })).toBe("/api/reserve-codes/export");
    expect(reserveExportUrl({ status: "IN_RESERVE", branchId: 3, from: "2026-11-01", to: null, q: " LOT " })).toBe(
      "/api/reserve-codes/export?status=IN_RESERVE&branchId=3&from=2026-11-01&q=LOT",
    );
  });

  it("Saplayn tekshiruvi fayli — buyurtma boʻyicha", () => {
    expect(verifyExportUrl(42)).toBe("/api/marking/orders/42/verify-export");
  });
});
