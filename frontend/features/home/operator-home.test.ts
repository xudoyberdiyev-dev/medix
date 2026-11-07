import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import { uzLatn } from "@/i18n/messages.generated";
import { operatorAttentionRows } from "./operator-home";

const t = createTranslator({ locale: "uz-Latn", messages: uzLatn, namespace: "home.attention" });
const ca = (count: number, amount: string) => ({ count, amount });

describe("operatorAttentionRows", () => {
  it("nol boʻlganlarini yashiradi, rad etilganlar birinchi va qizil", () => {
    const rows = operatorAttentionRows({
      drafts: ca(2, "150000.00"),
      pendingApproval: ca(0, "0.00"),
      rejected: ca(1, "90000.00"),
      rejectedDays: 7,
      stale: ca(0, "0.00"),
    });
    expect(rows.map((r) => r.key)).toEqual(["rej", "draft"]);
    expect(rows[0]?.danger).toBe(true);
    expect(rows[0]?.href).toBe("/orders?status=REJECTED&mine=1");
    const draft = rows[1];
    expect(draft && t(`rows.${draft.key}`, draft.values)).toBe("Yuborilmagan qoralamalar (2)");
  });

  it("summasi nol, lekin soni bor qoralama ham koʻrinadi", () => {
    const rows = operatorAttentionRows({
      drafts: ca(1, "0.00"),
      pendingApproval: ca(0, "0.00"),
      rejected: ca(0, "0.00"),
      rejectedDays: 7,
      stale: ca(0, "0.00"),
    });
    expect(rows).toHaveLength(1);
  });
});
