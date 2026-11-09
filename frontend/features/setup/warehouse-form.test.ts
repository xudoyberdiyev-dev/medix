import { describe, expect, it } from "vitest";
import {
  bodyFromForm,
  formFromWarehouse,
  freeZoneTypes,
  validateWarehouse,
  withZone,
  type Warehouse,
  type ZoneNames,
} from "./warehouse-form";

const names: ZoneNames = {
  RECEIVING: "Qabul",
  MAIN: "Asosiy saqlash",
  COLD: "Sovuq saqlash",
  SAFE: "Seyf",
  QUARANTINE: "Karantin",
  SHIPPING: "Joʻnatish",
};

describe("ombor kartasi (WarehousePanel)", () => {
  it("yangi ombor: 4 majburiy zona prototip tartibida, filial manzili bilan bir xil", () => {
    const f = formFromWarehouse(null, { branchId: 1, branchAddress: "Chilonzor", zoneNames: names });
    expect(f.zones.map((z) => z.type)).toEqual(["RECEIVING", "MAIN", "QUARANTINE", "SHIPPING"]);
    expect(f.sameAddress).toBe(true);
    const withCold = withZone(f.zones, "COLD", names.COLD);
    expect(withCold.map((z) => z.type)).toEqual(["RECEIVING", "MAIN", "COLD", "QUARANTINE", "SHIPPING"]);
    expect(withZone(withCold, "COLD", "x")).toBe(withCold);
    expect(freeZoneTypes(withCold)).toEqual(["SAFE"]);
  });

  it("tekshiruv: filial, nom, manzil, zona nomi boʻsh va takror", () => {
    const f = formFromWarehouse(null, { branchId: null, zoneNames: names });
    expect(validateWarehouse(f)).toEqual({ branchId: "eBranch", name: "eName", address: "eAddr" });
    const dup = {
      ...f,
      branchId: "1",
      name: "A",
      address: "B",
      zones: [
        { type: "MAIN" as const, name: "x" },
        { type: "RECEIVING" as const, name: " X " },
        { type: "SHIPPING" as const, name: " " },
      ],
    };
    expect(validateWarehouse(dup)).toEqual({ "zone.1": "eZDup", "zone.2": "eZName" });
  });

  it("soʻrov: filial manzili, ixtiyoriy zonalar, zona nomlari, masʼul", () => {
    const w: Warehouse = {
      id: 3,
      branchId: 1,
      name: "Markaziy",
      address: "Chilonzor",
      active: true,
      kind: "COLD",
      keeperId: 9,
      zones: [
        { id: 1, type: "MAIN", name: "Javon", sellable: true },
        { id: 2, type: "RECEIVING", name: "Qabul", sellable: false },
        { id: 3, type: "SAFE", name: "Seyf", sellable: true },
      ],
    };
    const f = formFromWarehouse(w, { branchId: 1, branchAddress: "Chilonzor", zoneNames: names });
    expect(f.sameAddress).toBe(true);
    expect(f.zones.map((z) => z.type)).toEqual(["RECEIVING", "MAIN", "SAFE"]);
    expect(bodyFromForm(f, "Chilonzor")).toEqual({
      branchId: 1,
      name: "Markaziy",
      address: "Chilonzor",
      kind: "COLD",
      keeperId: 9,
      extraZones: ["SAFE"],
      zoneNames: { RECEIVING: "Qabul", MAIN: "Javon", SAFE: "Seyf" },
    });
    expect(bodyFromForm({ ...f, keeperId: null, sameAddress: false, address: "" }, "Chilonzor")).toMatchObject({
      keeperId: undefined,
      address: undefined,
    });
  });
});
