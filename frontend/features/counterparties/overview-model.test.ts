import { describe, expect, it } from "vitest";
import {
  EMPTY_FILTERS,
  applyFilters,
  cents,
  facet,
  licenseOf,
  norm,
  overLimit,
  search,
  sortRows,
  viewCount,
  type OverviewLike,
} from "./overview-model";

const row = (p: Partial<OverviewLike>): OverviewLike => ({
  id: 1,
  tin: "302118447",
  name: "Shifo Farm",
  branches: ["TSH"],
  inScope: true,
  controlledAllowed: false,
  status: "ACTIVE",
  debt: "0.00",
  overdue: "0.00",
  maxOverdueDays: 0,
  agingBuckets: [],
  priceTypes: ["Narx"],
  operators: [],
  buyers: [],
  createdOn: "2026-01-10",
  ...p,
});
const TODAY = "2026-11-09";

describe("kontragentlar roʻyxati modeli", () => {
  it("pul satrini tiyinga aylantiradi (float yoʻq)", () => {
    expect(cents("1250000.50")).toBe(125000050n);
    expect(cents("0.1")).toBe(10n);
    expect(cents("-3.05")).toBe(-305n);
    expect(cents(null)).toBe(0n);
  });

  it("litsenziya holati: 30 kun — tugayotgan, oʻtgan — muddati oʻtgan", () => {
    expect(licenseOf("2026-12-09", TODAY)).toEqual({ state: "soon", days: 30 });
    expect(licenseOf("2026-12-10", TODAY).state).toBe("ok");
    expect(licenseOf("2026-11-08", TODAY).state).toBe("expired");
    expect(licenseOf(null, TODAY).state).toBe("none");
  });

  it("qidiruv kirill/lotin va apostrofga befarq, STIR va telefon raqamlar boʻyicha", () => {
    expect(norm("Шифо Фарм")).toBe("shifofarm");
    expect(search(row({}), "шифо")).toEqual({ where: "name" });
    expect(search(row({ name: "Sogʻlom Avlod" }), "soglom")).toEqual({ where: "name" });
    expect(search(row({}), "302 118")).toEqual({ where: "tin" });
    expect(search(row({ phone: "+998 90 111 22 33" }), "1112233")).toEqual({ where: "phone" });
    expect(search(row({ lastSaleNumber: "BY-TSH-000355" }), "by-tsh-000355")).toEqual({ where: "doc" });
    expect(search(row({}), "zarafshon")).toBeNull();
  });

  it("koʻrinishlar va filtrlar", () => {
    const rows = [
      row({ id: 1, debt: "100.00", agingBuckets: ["31-60"], creditLimit: "50.00" }),
      row({ id: 2, status: "BLOCKED", licenseValidUntil: "2026-11-20", controlledAllowed: true, branches: ["SMQ"] }),
      row({ id: 3, status: "INACTIVE", kind: "CLINIC", region: "Buxoro" }),
    ];
    expect(viewCount(rows, "debt", TODAY)).toBe(1);
    expect(viewCount(rows, "licSoon", TODAY)).toBe(1);
    expect(viewCount(rows, "ctrl", TODAY)).toBe(1);
    expect(viewCount(rows, "inactive", TODAY)).toBe(1);
    const ids = (f: Partial<typeof EMPTY_FILTERS>) => applyFilters(rows, { ...EMPTY_FILTERS, ...f }, TODAY, true).map((r) => r.id);
    expect(ids({ debt: ["31-60"] })).toEqual([1]);
    expect(ids({ debt: ["none"] })).toEqual([2, 3]);
    expect(ids({ branches: ["SMQ"] })).toEqual([2]);
    expect(ids({ kinds: ["CLINIC"], regions: ["Buxoro"] })).toEqual([3]);
    expect(ids({ overLimit: true })).toEqual([1]);
    expect(ids({ dateKind: "created", from: "2026-01-01", to: "2026-01-31" })).toEqual([1, 2, 3]);
    expect(ids({ dateKind: "last", from: "2026-01-01" })).toEqual([]);
    expect(overLimit(rows[1])).toBe(false);
  });

  it("saralash: boshqa filialdagilar oxirida, qarz BigInt boʻyicha", () => {
    const rows = [
      row({ id: 1, debt: "9.00" }),
      row({ id: 2, debt: "10.00", inScope: false }),
      row({ id: 3, debt: "100.00" }),
    ];
    expect(sortRows(rows, "debt", true).map((r) => r.id)).toEqual([3, 1, 2]);
    expect(sortRows(rows, "debt", false).map((r) => r.id)).toEqual([1, 3, 2]);
  });

  it("faset sanoqlari", () => {
    const rows = [row({ operators: ["Ali", "Vali"] }), row({ operators: ["Ali"] })];
    expect(facet(rows, (r) => r.operators)).toEqual([
      { value: "Ali", count: 2 },
      { value: "Vali", count: 1 },
    ]);
  });
});
