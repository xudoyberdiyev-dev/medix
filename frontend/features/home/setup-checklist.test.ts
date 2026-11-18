import { describe, expect, it } from "vitest";
import { checklistComplete } from "./setup-checklist";

describe("sozlash roʻyxati (U16)", () => {
  it("hammasi bajarilgach yashiriladi", () => {
    const item = (done: boolean) => ({ step: "BRANCHES" as const, done, count: done ? 1 : 0, link: "/settings/branches" });
    expect(checklistComplete(undefined)).toBe(false);
    expect(checklistComplete({ donePercent: 50, items: [item(true), item(false)] })).toBe(false);
    expect(checklistComplete({ donePercent: 100, items: [item(true), item(true)] })).toBe(true);
  });
});
