import { describe, expect, it } from "vitest";
import { shortageChoices } from "./shortage-panel";

describe("FS kamomadi — hal qilish yoʻllari", () => {
  it("yopiq kamomadda yoʻl yoʻq", () => {
    expect(shortageChoices({ open: false, canResolveAsBuyer: true, canResolveAsSeller: true })).toEqual([]);
  });
  it("xaridor filial faqat oʻz zimmasiga oladi", () => {
    expect(shortageChoices({ open: true, canResolveAsBuyer: true, canResolveAsSeller: false })).toEqual(["BUYER_WRITE_OFF"]);
  });
  it("sotuvchi filial — hisobdan chiqarish yoki qaytarish", () => {
    expect(shortageChoices({ open: true, canResolveAsBuyer: false, canResolveAsSeller: true })).toEqual(["SELLER_WRITE_OFF", "RETURN"]);
  });
  it("barcha filiallar (Direktor) — uchala yoʻl", () => {
    expect(shortageChoices({ open: true, canResolveAsBuyer: true, canResolveAsSeller: true })).toHaveLength(3);
  });
});
