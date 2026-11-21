import { describe, expect, it } from "vitest";
import { issuesCsv } from "./smartup-import";

describe("issuesCsv", () => {
  it("varaq, qator va sababni CSV qatorlariga yozadi (qatorsiz xato — boʻsh katak)", () => {
    const csv = issuesCsv(
      [
        { sheet: "Tovar", row: 3, message: "Mahsulot topilmadi: «1»" },
        { sheet: "Kassa va bank", message: "Oʻtkazilgan; tuzating" },
      ],
      ["Varaq", "Qator", "Sabab"],
    );
    const lines = csv.trim().split(/\r?\n/);
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain("Tovar");
    expect(lines[1]).toContain("3");
    expect(lines[2]).toMatch(/^"?Kassa va bank"?[;,]{2}/);
  });
});
