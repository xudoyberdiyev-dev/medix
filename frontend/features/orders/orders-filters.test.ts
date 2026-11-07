import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import { uzLatn } from "@/i18n/messages.generated";
import { idParam } from "@/lib/url-filters";
import { soldLabel, soldParam } from "./orders-page";

const t = createTranslator({ locale: "uz-Latn", messages: uzLatn, namespace: "orders" });

describe("buyurtmalar: hisobotdan oʻtish filtrlari", () => {
  it("operator va mijoz", () => {
    expect(idParam(new URLSearchParams("operatorId=7&operator=Aziza"), "operatorId", "operator", "Operator")).toEqual({
      id: 7,
      name: "Aziza",
    });
    expect(idParam(new URLSearchParams("operatorId=7"), "operatorId", "operator", "Operator")).toEqual({ id: 7, name: "Operator #7" });
    expect(idParam(new URLSearchParams("customerId=abc"), "customerId", "customer", "Mijoz")).toBeNull();
  });

  it("sotuv davri — faqat YYYY-MM-DD", () => {
    expect(soldParam(new URLSearchParams("soldFrom=2026-11-01&soldTo=2026-11-05"))).toEqual({ from: "2026-11-01", to: "2026-11-05" });
    expect(soldParam(new URLSearchParams("soldFrom=bugun"))).toBeNull();
    expect(soldLabel({ from: "2026-11-05", to: "2026-11-05" }, t)).toBe("Sotuv: 05.11.2026");
    expect(soldLabel({ from: "2026-11-01", to: "2026-11-05" }, t)).toBe("Sotuv: 01.11.2026 – 05.11.2026");
  });
});

describe("kirimlar eksporti", () => {
  it("filtrlar bilan havola", async () => {
    const { receiptsExportHref } = await import("@/features/receipts/receipts-page");
    expect(receiptsExportHref({ branchId: null, status: null, supplierId: null })).toBe("/api/receipts/export");
    expect(receiptsExportHref({ branchId: 2, status: "POSTED", supplierId: 9 })).toBe(
      "/api/receipts/export?branchId=2&status=POSTED&supplierId=9",
    );
  });
});
