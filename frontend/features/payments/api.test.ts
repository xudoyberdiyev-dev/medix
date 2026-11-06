import { describe, expect, it } from "vitest";
import { fifoPreview } from "./api";

const docs = [
  { docType: "SV", docId: 1, open: "5000.00" },
  { docType: "SV", docId: 2, open: "4000.50" },
];

describe("fifoPreview", () => {
  it("eng eski qarzdan, ortigʻi avans", () => {
    expect(fifoPreview(docs, "6000.25")).toEqual({
      parts: [
        { key: "SV:1", amount: "5000.00" },
        { key: "SV:2", amount: "1000.25" },
      ],
      advance: "0.00",
    });
    expect(fifoPreview(docs, "10000").advance).toBe("999.50");
    expect(fifoPreview([], "0.5")).toEqual({ parts: [], advance: "0.50" });
  });
});
