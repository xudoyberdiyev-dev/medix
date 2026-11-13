import { describe, expect, it } from "vitest";
import { isNavActive, navigation, navigationFor } from "./nav";

const keys = (perms: string[], home?: string) => navigationFor(perms, home).flatMap((g) => g.items.map((i) => i.key));

describe("ruxsatga qarab menyu", () => {
  it("panel rollari (masalan, haydovchi) faqat bosh sahifa va oʻz panelini koʻradi", () => {
    expect(keys(["trip.driver"], "driver")).toEqual(["home", "driver"]);
    expect(keys(["orders.view", "picking.do"], "picker")).toEqual(["home", "picking"]);
    expect(keys(["marking.scan", "marking.view"], "marker")).toEqual(["home", "marking"]);
  });

  it("panel bandlari boshqa rollarga koʻrinmaydi (Direktorda Monitor yoʻq), buyruqlar oynasida — bor", () => {
    expect(keys(["orders.queue", "orders.manage"], "director")).toEqual(["home", "orders"]);
    expect(keys(["orders.queue"])).toContain("warehouse");
  });

  it("kalitga qarab: Qoldiqlar — stock.view, Sozlamalar — settings.view", () => {
    expect(keys(["receipt.view", "products.view"], "")).toEqual(["home", "receipts", "products"]);
    expect(keys(["staff.view"], "")).toEqual(["home", "staff"]);
    expect(keys(["settings.view"], "")).toEqual(["home", "settings"]);
    expect(keys(["stock.view"], "")).toContain("stock");
    expect(navigationFor(undefined)).toEqual([]);
    expect(keys(["cdebt.view", "sdebt.view"], "")).toEqual(["home", "customer-debts", "supplier-debts"]);
    expect(keys(["recon.view"], "")).toEqual(["home", "reconciliations"]);
  });

  it("prototip tuzilmasi: guruhlar va bandlar tartibi", () => {
    const groups = navigation.filter((g) => g.key).map((g) => [g.key, g.items.map((i) => i.key)]);
    expect(groups).toEqual([
      ["sales", ["orders", "approvals", "shipments"]],
      ["warehouse", ["receipts", "stock", "expiry", "transfers", "inventory-counts", "returns", "reserveCodes", "opening"]],
      ["money", ["payments", "cash", "bank", "invoices", "customer-debts", "supplier-debts", "reconciliations"]],
      ["references", ["products", "customers", "suppliers", "prices", "salesZones", "dictionaries"]],
      ["admin", ["company", "branches", "warehouses", "staff", "roles", "audit", "settings"]],
    ]);
  });

  it("yorliq sahifalarida ham band faol: Koʻchirish, Qaytarish, YB qarzi → Bonus", () => {
    const item = (k: string) => navigation.flatMap((g) => g.items).find((i) => i.key === k)!;
    expect(isNavActive("/zone-transfers/5", item("transfers"))).toBe(true);
    expect(isNavActive("/branch-sales", item("transfers"))).toBe(true);
    expect(isNavActive("/supplier-returns", item("returns"))).toBe(true);
    expect(isNavActive("/customer-returns", item("returns"))).toBe(true);
    expect(isNavActive("/bonuses", item("supplier-debts"))).toBe(true);
    expect(isNavActive("/settings/roles", item("settings"))).toBe(false);
    expect(isNavActive("/settings/roles/3", item("roles"))).toBe(true);
    expect(isNavActive("/", item("home"))).toBe(true);
    expect(isNavActive("/orders", item("home"))).toBe(false);
  });
});

describe("yorliqli bandlar", () => {
  const href = (perms: string[], key: string) =>
    navigationFor(perms)
      .flatMap((g) => g.items)
      .find((i) => i.key === key)?.href;

  it("manzil — ruxsatli birinchi yorliq", () => {
    expect(href(["qy.view"], "returns")).toBe("/supplier-returns");
    expect(href(["hc.view", "qy.view"], "returns")).toBe("/write-offs");
    expect(href(["qm.view", "hc.view"], "returns")).toBe("/customer-returns");
    expect(href(["supplierBonus.confirm"], "supplier-debts")).toBe("/bonuses");
    // Koʻchirish — bitta roʻyxat har qanday koʻchirish ruxsati bilan
    expect(href(["transfer.zk"], "transfers")).toBe("/transfers");
  });
});
