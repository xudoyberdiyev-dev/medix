import { describe, expect, it } from "vitest";
import { canApprove, canCancelOrder } from "./api";

const none = { own: false, cancel: false, manage: false, cancelPick: false };

describe("buyurtma qoidalari (server bilan bir xil)", () => {
  it("bekor qilish", () => {
    expect(canCancelOrder("DRAFT", { ...none, own: true, cancel: true })).toBe(true);
    expect(canCancelOrder("DRAFT", { ...none, cancel: true })).toBe(false);
    expect(canCancelOrder("PENDING_APPROVAL", { ...none, manage: true })).toBe(true);
    expect(canCancelOrder("QUEUED", { ...none, own: true, cancel: true })).toBe(false);
    expect(canCancelOrder("LOADING", { ...none, cancelPick: true })).toBe(true);
    expect(canCancelOrder("IN_TRANSIT", { own: true, cancel: true, manage: true, cancelPick: true })).toBe(false);
  });

  it("tasdiq darajasi", () => {
    expect(canApprove("BRANCH", true, false)).toBe(true);
    expect(canApprove("DIRECTOR", true, false)).toBe(false);
    expect(canApprove("DIRECTOR", false, true)).toBe(true);
    expect(canApprove(null, true, true)).toBe(false);
  });
});
