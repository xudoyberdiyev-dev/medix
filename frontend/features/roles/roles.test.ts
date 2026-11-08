import { describe, expect, it } from "vitest";
import { changes, copyGrants, groupRows, lockOf, toRequest, toggle, type MatrixPermission, type MatrixState } from "./matrix";

const P = (key: string, kind: string, group = "sales", lock: string | null = null): MatrixPermission => ({
  key,
  module: key.split(".")[0],
  description: key,
  group,
  kind,
  page: key.split(".")[0],
  lock,
});
const perms = [
  P("orders.view", "view"),
  P("orders.create", "create"),
  P("orders.cancel", "cancel"),
  P("approvals.director", "approve", "sales", "dir"),
  P("marking.scan", "create", "wh", "excl"),
  P("special.cost", "special", "special"),
];

describe("rollar matritsasi", () => {
  it("amal yoqilsa — koʻrish ham; koʻrish oʻchsa — bogʻliqlar ham", () => {
    const on = toggle([], "orders.create", true, perms);
    expect(on.keys).toEqual(["orders.create", "orders.view"]);
    expect(on.viewOn).toBe(true);
    const off = toggle(["orders.view", "orders.create", "orders.cancel"], "orders.view", false, perms);
    expect(off.keys).toEqual([]);
    expect(off.off).toEqual(["orders.create", "orders.cancel"]);
  });

  it("qulflar: Direktor ustuni, «faqat Direktor», excl", () => {
    expect(lockOf("DIRECTOR", perms[0])).toBe("dir");
    expect(lockOf("OPERATOR", perms[3])).toBe("only");
    expect(lockOf("MARKER", perms[4])).toBeNull();
    expect(lockOf("OPERATOR", perms[1])).toBeNull();
  });

  it("oʻzgarishlar soni, olib tashlanganlar va xodimlar", () => {
    const role = { name: "Operator", scope: "own", home: "operator", active: true, system: true, employeeCount: 3 };
    const base: MatrixState = { roles: [{ code: "OPERATOR", ...role }], grants: { OPERATOR: ["orders.view", "orders.create"] } };
    const draft: MatrixState = {
      roles: [{ code: "OPERATOR", ...role, scope: "all" }],
      grants: { OPERATOR: ["orders.view", "orders.cancel"] },
    };
    const c = changes(base, draft);
    expect(c.n).toBe(3);
    expect(c.rem).toEqual({ OPERATOR: ["orders.create"] });
    expect(c.employees).toBe(3);
  });

  it("nusxa — «faqat Direktor» kalitlarisiz; soʻrovda yangi rol kodsiz, Direktorsiz", () => {
    const s: MatrixState = {
      roles: [
        { code: "DIRECTOR", name: "Direktor", scope: "all", home: "director", active: true, system: true, employeeCount: 1 },
        {
          code: "new:1",
          name: "Katta operator",
          scope: "own",
          home: "operator",
          active: true,
          system: false,
          employeeCount: 0,
          copiedFrom: "DIRECTOR",
        },
      ],
      grants: { DIRECTOR: ["orders.view", "approvals.director"], "new:1": ["orders.view"] },
    };
    expect(copyGrants("DIRECTOR", s, perms)).toEqual(["orders.view"]);
    const req = toRequest(s);
    expect(req).toHaveLength(1);
    expect(req[0].code).toBeUndefined();
    expect(req[0].copiedFrom).toBe("DIRECTOR");
  });

  it("qatorlar: qidiruv va «faqat maxsus»", () => {
    const g = groupRows(perms, { query: "", onlySpecial: true, onlyChanged: false, name: (p) => p.key, isChanged: () => false });
    expect(g.map((x) => x.group)).toEqual(["special"]);
    const q = groupRows(perms, { query: "cancel", onlySpecial: false, onlyChanged: false, name: (p) => p.key, isChanged: () => false });
    expect(q[0].items.map((p) => p.key)).toEqual(["orders.cancel"]);
  });
});
