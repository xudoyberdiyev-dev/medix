import { describe, expect, it } from "vitest";
import { hasUnsavedChanges } from "./order-drawer";

describe("buyurtma: saqlanmagan oʻzgarishlar", () => {
  it("yangi qoralama — qator boʻlsa ogohlantiradi", () => {
    expect(hasUnsavedChanges({ editable: true, isNew: true, dirty: false, lineCount: 2 })).toBe(true);
    expect(hasUnsavedChanges({ editable: true, isNew: true, dirty: false, lineCount: 0 })).toBe(false);
  });
  it("saqlangan qoralama — faqat oʻzgargan boʻlsa; tahrirlanmaydigan hujjat — hech qachon", () => {
    expect(hasUnsavedChanges({ editable: true, isNew: false, dirty: true, lineCount: 3 })).toBe(true);
    expect(hasUnsavedChanges({ editable: true, isNew: false, dirty: false, lineCount: 3 })).toBe(false);
    expect(hasUnsavedChanges({ editable: false, isNew: false, dirty: true, lineCount: 3 })).toBe(false);
  });
});
