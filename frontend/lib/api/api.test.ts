import { describe, expect, it } from "vitest";
import { needsCsrf, readCookie } from "./csrf";
import { ApiError, FALLBACK_ERROR, toApiError } from "./errors";
import { unwrap } from "./client";
import { shouldRetry } from "./query-client";

describe("csrf", () => {
  it("faqat oʻzgartiruvchi soʻrovlarga token kerak", () => {
    expect(needsCsrf("GET")).toBe(false);
    expect(needsCsrf("head")).toBe(false);
    expect(needsCsrf("POST")).toBe(true);
    expect(needsCsrf("delete")).toBe(true);
  });

  it("cookie qatoridan qiymatni oʻqiydi", () => {
    expect(readCookie("a=1; XSRF-TOKEN=abc%3D%3D; b=2", "XSRF-TOKEN")).toBe("abc==");
    expect(readCookie("a=1", "XSRF-TOKEN")).toBeUndefined();
    expect(readCookie("", "XSRF-TOKEN")).toBeUndefined();
  });
});

describe("ApiError", () => {
  it("ProblemDetail dan matn, kod va maydon xatolarini oladi", () => {
    const e = toApiError(409, {
      detail: "Qoldiq yetarli emas",
      code: "stock.insufficient",
      errors: { qty: "Miqdor katta" },
    });
    expect(e.message).toBe("Qoldiq yetarli emas");
    expect(e.code).toBe("stock.insufficient");
    expect(e.fieldErrors).toEqual({ qty: "Miqdor katta" });
    expect(e.isClientError).toBe(true);
  });

  it("tana boʻlmasa umumiy matn", () => {
    const e = toApiError(500, undefined);
    expect(e.message).toBe(FALLBACK_ERROR);
    expect(e.isClientError).toBe(false);
  });
});

describe("unwrap", () => {
  it("muvaffaqiyatda maʼlumot qaytaradi", async () => {
    const response = new Response("{}", { status: 200 });
    await expect(unwrap(Promise.resolve({ data: { id: 1 }, response }))).resolves.toEqual({ id: 1 });
  });

  it("xatoda ApiError tashlaydi", async () => {
    const response = new Response("{}", { status: 403 });
    const p = unwrap(Promise.resolve({ error: { detail: "Ruxsat yoʻq" }, response }));
    await expect(p).rejects.toBeInstanceOf(ApiError);
    await expect(p).rejects.toMatchObject({ status: 403, message: "Ruxsat yoʻq" });
  });
});

describe("shouldRetry", () => {
  it("4xx da qayta urinmaydi, 5xx da 2 martagacha", () => {
    expect(shouldRetry(0, new ApiError(404, undefined))).toBe(false);
    expect(shouldRetry(0, new ApiError(503, undefined))).toBe(true);
    expect(shouldRetry(2, new ApiError(503, undefined))).toBe(false);
    expect(shouldRetry(0, new TypeError("fetch failed"))).toBe(true);
  });
});
