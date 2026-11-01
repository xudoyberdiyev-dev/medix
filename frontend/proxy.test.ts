// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy, SESSION_COOKIE } from "./proxy";

function run(path: string, cookie?: string) {
  const req = new NextRequest(new URL(path, "http://localhost:3000"), cookie ? { headers: { cookie } } : undefined);
  return proxy(req);
}

describe("proxy", () => {
  it("sessiyasiz — login sahifasiga, qaytish yoʻli bilan", () => {
    const res = run("/orders?x=1");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/login?next=%2Forders%3Fx%3D1");
    expect(run("/").headers.get("location")).toBe("http://localhost:3000/login");
  });

  it("sessiya cookie'si bor yoki ochiq sahifa — oʻtkazadi", () => {
    expect(run("/orders", `${SESSION_COOKIE}=abc`).headers.get("location")).toBeNull();
    expect(run("/login").headers.get("location")).toBeNull();
  });
});
