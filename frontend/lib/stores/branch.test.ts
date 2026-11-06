import { describe, expect, it } from "vitest";
import { effectiveBranchId } from "./branch";

describe("effectiveBranchId", () => {
  it("bitta filial xodimi doim oʻz filialida", () => {
    expect(effectiveBranchId({ allBranches: false, branchId: 2 }, 5, [1, 2, 5])).toBe(2);
  });
  it("barcha filiallarni koʻradigan — tanlov yoki «barchasi»", () => {
    expect(effectiveBranchId({ allBranches: true }, 5, [1, 5])).toBe(5);
    expect(effectiveBranchId({ allBranches: true }, null, [1, 5])).toBeNull();
  });
  it("nofaol yoki yoʻq filial tanlovi bekor qilinadi", () => {
    expect(effectiveBranchId({ allBranches: true }, 9, [1, 5])).toBeNull();
  });
});
