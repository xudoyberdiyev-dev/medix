import { describe, expect, it } from "vitest";
import {
  EMPTY_FILTERS,
  advanceOf,
  facet,
  filterRows,
  filtersFromParams,
  kpis,
  totals,
  viewCounts,
  type PayRowLike,
} from "./overview-model";

const row = (p: Partial<PayRowLike>): PayRowLike => ({
  kind: "MT",
  id: 1,
  number: "MT-TSH-000001",
  paymentDate: "2026-11-09",
  party: "Shifo Farm",
  partySub: "Toshkent",
  accountId: 10,
  account: "Asosiy kassa",
  accountKind: "CASH",
  amount: "1000.00",
  status: "POSTED",
  createdBy: "Nigora",
  createdAt: "2026-11-09T05:00:00Z",
  ...p,
});

const rows = [
  row({ id: 1, amount: "1500.10", allocated: "1000.00", advance: "500.10" }),
  row({ id: 2, kind: "YT", number: "YT-TSH-000002", party: "Nobel", partySub: "302118447", amount: "700.05", status: "PENDING" }),
  row({ id: 3, kind: "YT", number: "YT-TSH-000003", party: "Nobel", amount: "200.00", accountKind: "BANK", accountId: 11 }),
  row({ id: 4, status: "DRAFT", amount: "300.00", paymentDate: "2026-11-08", createdBy: "Aziz" }),
  row({ id: 5, status: "CANCELLED", amount: "50.00", paymentDate: "2026-11-01" }),
];

describe("toʻlovlar roʻyxati modeli", () => {
  it("koʻrinishlar sanogʻi", () => {
    expect(viewCounts(rows)).toEqual({ all: 5, in: 3, out: 2, pending: 1, cancelled: 1 });
  });

  it("kartalar — bugungi tasdiqlangan kirim/chiqim, tasdiqlashda, qoralama", () => {
    const k = kpis(rows, "2026-11-09");
    expect(k.inToday).toEqual({ sum: "1500.10", count: 1 });
    expect(k.outToday).toEqual({ sum: "200.00", count: 1 });
    expect(k.pending).toEqual({ sum: "700.05", count: 1 });
    expect(k.drafts).toEqual({ sum: "300.00", count: 1 });
  });

  it("jamilar — faqat tasdiqlangan; chiqim manfiy, sof = kirim − chiqim (float yoʻq)", () => {
    expect(totals(rows)).toEqual({ in: "1500.10", out: "-200.00", net: "1300.10" });
  });

  it("filtrlar: koʻrinish, qidiruv (kirill ham), usul, sana, saralash", () => {
    expect(filterRows(rows, { ...EMPTY_FILTERS, view: "out" }).map((r) => r.id)).toEqual([3, 2]);
    expect(filterRows(rows, { ...EMPTY_FILTERS, q: "шифо" }).map((r) => r.id)).toEqual([1, 4, 5]);
    expect(filterRows(rows, { ...EMPTY_FILTERS, methods: ["BANK"] }).map((r) => r.id)).toEqual([3]);
    expect(filterRows(rows, { ...EMPTY_FILTERS, from: "2026-11-08", to: "2026-11-08" }).map((r) => r.id)).toEqual([4]);
    expect(filterRows(rows, { ...EMPTY_FILTERS, by: ["Aziz"], statuses: ["DRAFT"] }).map((r) => r.id)).toEqual([4]);
  });

  it("avans faqat tasdiqlangan va > 0 boʻlsa; variantlar soni bilan", () => {
    expect(advanceOf(rows[0])).toBe("500.10");
    expect(advanceOf(row({ advance: "0.00" }))).toBeNull();
    expect(advanceOf(row({ status: "CANCELLED", advance: "5.00" }))).toBeNull();
    expect(
      facet(
        rows,
        (r) => r.party,
        (r) => r.party,
      ),
    ).toEqual([
      { value: "Nobel", label: "Nobel", count: 2 },
      { value: "Shifo Farm", label: "Shifo Farm", count: 3 },
    ]);
  });

  it("URL: eski ?tab=yt, ?status=pending, ?from=", () => {
    const of = (o: Record<string, string>) => filtersFromParams((k) => o[k] ?? null);
    expect(of({ tab: "yt" }).view).toBe("out");
    expect(of({ status: "pending" }).view).toBe("pending");
    expect(of({ status: "draft" }).statuses).toEqual(["DRAFT"]);
    expect(of({ from: "2026-11-01" })).toMatchObject({ from: "2026-11-01", to: "2026-11-01" });
  });
});
