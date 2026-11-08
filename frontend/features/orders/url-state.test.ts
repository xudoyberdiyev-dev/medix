import { describe, expect, it } from "vitest";
import { DEFAULT_ORDER_FILTERS, hasOrderFilters, ordersExportHref, parseOrderFilters, serializeOrderFilters } from "./url-state";

const names = { customer: "Mijoz", operator: "Operator" };
const parse = (qs: string) => parseOrderFilters(new URLSearchParams(qs), names);

describe("buyurtmalar: filtrlar URL'da (SPEC 120)", () => {
  it("standart — boʻsh havola, kiritilgan vaqti boʻyicha yangisi tepada", () => {
    expect(parse("")).toEqual(DEFAULT_ORDER_FILTERS);
    expect(serializeOrderFilters(DEFAULT_ORDER_FILTERS)).toBe("");
    expect(hasOrderFilters(DEFAULT_ORDER_FILTERS)).toBe(false);
  });

  it("aylanma: holat, qidiruv, sana, mijoz, saralash, sahifa", () => {
    const qs = "status=QUEUED&q=shifo&mine=1&customerId=4&customer=Shifo&from=2026-11-01&to=2026-11-07&sort=TOTAL&dir=desc&page=3";
    const f = parse(qs);
    expect(f).toMatchObject({
      status: "QUEUED",
      q: "shifo",
      mine: true,
      customers: [{ id: 4, name: "Shifo" }],
      orderFrom: "2026-11-01",
      orderTo: "2026-11-07",
      sort: "TOTAL",
      desc: true,
      page: 3,
    });
    expect(parse(serializeOrderFilters(f))).toEqual(f);
    expect(hasOrderFilters(f)).toBe(true);
  });

  it("notoʻgʻri qiymatlar tashlanadi", () => {
    const f = parse("status=NOPE&from=07.11.2026&sort=x&page=-2&customerId=abc");
    expect(f).toEqual(DEFAULT_ORDER_FILTERS);
  });

  it("boshqa ustun — standart oʻsish tartibida", () => {
    expect(parse("sort=CUSTOMER").desc).toBe(false);
    expect(serializeOrderFilters({ ...DEFAULT_ORDER_FILTERS, sort: "CUSTOMER", desc: false })).toBe("sort=CUSTOMER");
    expect(serializeOrderFilters({ ...DEFAULT_ORDER_FILTERS, desc: false })).toBe("dir=asc");
  });

  it("prototip filtr chiplari — bir nechta qiymat, aylanma", () => {
    const f = parse(
      "customerId=4&customer=Shifo&customerId=9&st=QUEUED&st=PICKING&st=NOPE&dt=PICKUP&pt=CASH&pt=ONLINE&regionId=3&operatorId=7&per=50",
    );
    expect(f).toMatchObject({
      customers: [
        { id: 4, name: "Shifo" },
        { id: 9, name: "Mijoz #9" },
      ],
      operators: [{ id: 7, name: "Operator #7" }],
      statuses: ["QUEUED", "PICKING"],
      delivery: ["PICKUP"],
      payments: ["CASH", "ONLINE"],
      regions: [3],
      size: 50,
    });
    expect(parse(serializeOrderFilters(f)).statuses).toEqual(f.statuses);
    expect(ordersExportHref({ ...DEFAULT_ORDER_FILTERS, regions: [3, 5], payments: ["CASH"] }, null)).toBe(
      "/api/orders/export?paymentType=CASH&regionId=3&regionId=5&sort=CREATED&desc=true",
    );
  });

  it("eksport havolasi — filtrlar va saralash bilan", () => {
    expect(ordersExportHref(DEFAULT_ORDER_FILTERS, null)).toBe("/api/orders/export?sort=CREATED&desc=true");
    expect(ordersExportHref({ ...parse("status=DELIVERED&from=2026-11-01&q=BY-1"), sort: "DATE", desc: false }, 2)).toBe(
      "/api/orders/export?branchId=2&status=DELIVERED&q=BY-1&orderFrom=2026-11-01&sort=DATE&desc=false",
    );
  });
});
