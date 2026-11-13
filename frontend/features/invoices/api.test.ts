import { describe, expect, it } from "vitest";
import { fileProblem, MAX_FILE_BYTES, waitParts } from "./api";

describe("faktura navbati (O10d)", () => {
  it("fayl: PDF/JPG/PNG, 10 MB gacha; tur kengaytmadan ham", () => {
    expect(fileProblem({ type: "application/pdf", name: "ef.pdf", size: 100 })).toBeNull();
    expect(fileProblem({ type: "image/jpg", name: "ttn", size: 100 })).toBeNull();
    expect(fileProblem({ type: "", name: "TTN.PNG", size: 100 })).toBeNull();
    expect(fileProblem({ type: "text/plain", name: "a.txt", size: 100 })).toBe("type");
    expect(fileProblem({ type: "application/pdf", name: "a.pdf", size: MAX_FILE_BYTES + 1 })).toBe("size");
    expect(fileProblem({ type: "application/pdf", name: "a.pdf", size: 0 })).toBe("size");
  });

  it("kutish vaqti: soat/kun, 1 kundan koʻp — kechikkan; yuborilganda — yuborilgan paytgacha", () => {
    const opened = "2026-11-13T10:00:00Z";
    expect(waitParts(opened, null, Date.parse("2026-11-13T13:30:00Z"))).toEqual({ d: 0, h: 3, late: false });
    expect(waitParts(opened, null, Date.parse("2026-11-14T15:00:00Z"))).toEqual({ d: 1, h: 5, late: true });
    expect(waitParts(opened, "2026-11-13T12:00:00Z", Date.parse("2026-11-20T00:00:00Z"))).toEqual({ d: 0, h: 2, late: false });
    expect(waitParts(opened, null, Date.parse("2026-11-13T09:00:00Z")).h).toBe(0);
  });
});
