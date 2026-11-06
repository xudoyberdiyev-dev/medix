import { describe, expect, it } from "vitest";
import { MAX_VIEWS, addView, isCurrentView, normalizeQuery, parseViews, removeView, type SavedView } from "./saved-views";

describe("saqlangan koʻrinishlar", () => {
  it("sahifa raqami soʻrovdan olib tashlanadi", () => {
    expect(normalizeQuery("?q=para&page=3&status=ALL")).toBe("q=para&status=ALL");
    expect(normalizeQuery("")).toBe("");
  });

  it("nom tekshiriladi, bir xil nom yangilanadi va boshiga chiqadi", () => {
    expect(addView([], "   ", "q=a", [])).toEqual({ ok: false, error: "empty" });
    expect(addView([], "x".repeat(41), "q=a", [])).toEqual({ ok: false, error: "tooLong" });
    const first = addView([], " Nazoratdagi  dorilar ", "flag=controlled&page=2", ["country"]);
    expect(first.ok && first.views).toEqual([{ name: "Nazoratdagi dorilar", query: "flag=controlled", hidden: ["country"] }]);
    const views: SavedView[] = [
      { name: "A", query: "q=1", hidden: [] },
      { name: "Nazoratdagi dorilar", query: "flag=controlled", hidden: [] },
    ];
    const r = addView(views, "nazoratdagi DORILAR", "flag=marked", []);
    expect(r.ok && r.views.map((v) => [v.name, v.query])).toEqual([
      ["nazoratdagi DORILAR", "flag=marked"],
      ["A", "q=1"],
    ]);
  });

  it("chegara: 20 tadan koʻp saqlanmaydi, lekin mavjudini yangilash mumkin", () => {
    const views = Array.from({ length: MAX_VIEWS }, (_, i) => ({ name: `V${i}`, query: "", hidden: [] }));
    expect(addView(views, "Yangi", "", [])).toEqual({ ok: false, error: "limit" });
    expect(addView(views, "V3", "q=x", []).ok).toBe(true);
  });

  it("buzilgan xotira xavfsiz oʻqiladi", () => {
    expect(parseViews(null)).toEqual([]);
    expect(parseViews("{buzuq")).toEqual([]);
    expect(parseViews('{"name":"A"}')).toEqual([]);
    expect(parseViews('[{"name":"A","query":"q=1","hidden":["x"]},{"name":1},{"name":"B","query":"","hidden":[2]}]')).toEqual([
      { name: "A", query: "q=1", hidden: ["x"] },
    ]);
  });

  it("oʻchirish va joriy koʻrinishni aniqlash", () => {
    const v: SavedView = { name: "A", query: "status=ALL&q=para", hidden: ["unit", "country"] };
    expect(removeView([v], "A")).toEqual([]);
    expect(isCurrentView(v, "q=para&status=ALL&page=4", ["country", "unit"])).toBe(true);
    expect(isCurrentView(v, "q=para", ["country", "unit"])).toBe(false);
    expect(isCurrentView(v, "q=para&status=ALL", ["unit"])).toBe(false);
  });
});
