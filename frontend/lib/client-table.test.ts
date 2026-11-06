import { describe, expect, it } from "vitest";
import { compareValues, sortRows } from "./client-table";

describe("client-table", () => {
  it("pul satrlarini son sifatida aniq solishtiradi", () => {
    expect(compareValues("9.50", "10.00")).toBeLessThan(0);
    expect(compareValues("-1.00", "0.00")).toBeLessThan(0);
    expect(compareValues("12345678901234567.01", "12345678901234567.00")).toBeGreaterThan(0);
    expect(compareValues("100", "100.00")).toBe(0);
  });

  it("matnni oʻzbekcha, kichik-katta harfsiz solishtiradi", () => {
    expect(compareValues("apteka", "Bahor")).toBeLessThan(0);
    expect(compareValues("Dorixona 2", "Dorixona 10")).toBeLessThan(0);
  });

  it("boʻsh qiymatlar har ikki yoʻnalishda oxirida, saralash barqaror", () => {
    const rows = [
      { n: "b", v: null },
      { n: "a", v: "2.00" },
      { n: "c", v: "1.00" },
      { n: "d", v: "2.00" },
    ];
    const get = (r: (typeof rows)[number]) => r.v;
    expect(sortRows(rows, { key: "v", dir: "asc" }, get).map((r) => r.n)).toEqual(["c", "a", "d", "b"]);
    expect(sortRows(rows, { key: "v", dir: "desc" }, get).map((r) => r.n)).toEqual(["a", "d", "c", "b"]);
    expect(sortRows(rows, undefined, get).map((r) => r.n)).toEqual(["b", "a", "c", "d"]);
  });
});
