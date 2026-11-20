import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const load = (l: string) => JSON.parse(readFileSync(new URL(`../../messages/${l}.json`, import.meta.url), "utf8"));

function flat(o: Record<string, unknown>, p = ""): Map<string, string> {
  const m = new Map<string, string>();
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === "string") m.set(p + k, v);
    else for (const [kk, vv] of flat(v as Record<string, unknown>, `${p}${k}.`)) m.set(kk, vv);
  }
  return m;
}
const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((x) => x[1]).sort().join(",");

test("uch tilda kalitlar va oʻrinbosarlar bir xil", () => {
  const base = flat(load("uz-Latn"));
  for (const l of ["uz-Cyrl", "ru"]) {
    const other = flat(load(l));
    assert.deepEqual([...other.keys()].sort(), [...base.keys()].sort(), l);
    for (const [k, v] of base) assert.equal(vars(other.get(k) ?? ""), vars(v), `${l}: ${k}`);
  }
});
