import { describe, expect, it } from "vitest";
import { fileProblem, formatSize, isOverdue, overallStatus, type ThreadSummary } from "./api";
import { dueToIso } from "./composer";
import { threadTitle } from "./labels";

const t = (k: string) => ({ allBranches: "Barcha filiallar", wholeBranch: "Butun filial", deletedUser: "?" })[k] ?? k;

function thread(p: Partial<ThreadSummary>): ThreadSummary {
  return {
    id: 1,
    kind: "GROUP",
    audience: "PEOPLE",
    others: [],
    participantCount: 1,
    lastMessageAt: "2026-11-17T09:00:00Z",
    unread: 0,
    ...p,
  };
}

const person = (id: number, fullName: string) => ({ id, fullName });

describe("O12 xabarlar", () => {
  it("guruh topshirigʻi umumiy holati serverdagi bilan bir xil", () => {
    expect(overallStatus([{ status: "NEW" }, { status: "NEW" }])).toBe("NEW");
    expect(overallStatus([{ status: "NEW" }, { status: "DONE" }])).toBe("IN_PROGRESS");
    expect(overallStatus([{ status: "DONE" }, { status: "CANCELLED" }])).toBe("DONE");
    expect(overallStatus([{ status: "CANCELLED" }])).toBe("CANCELLED");
    expect(overallStatus([{ status: "IN_PROGRESS" }, { status: "DONE" }])).toBe("IN_PROGRESS");
  });

  it("muddati oʻtgan — faqat bajarilmagan topshiriq", () => {
    const now = Date.parse("2026-11-17T12:00:00Z");
    expect(isOverdue("2026-11-17T11:00:00Z", "NEW", now)).toBe(true);
    expect(isOverdue("2026-11-17T11:00:00Z", "DONE", now)).toBe(false);
    expect(isOverdue("2026-11-17T13:00:00Z", "IN_PROGRESS", now)).toBe(false);
    expect(isOverdue(null, "NEW", now)).toBe(false);
  });

  it("suhbat nomi: shaxsiy, rol, filial, tanlangan xodimlar", () => {
    expect(threadTitle(thread({ kind: "DIRECT", audience: "PERSON", others: [person(2, "Aziz Karimov")] }), t)).toBe("Aziz Karimov");
    expect(threadTitle(thread({ audience: "ROLE", audienceRoleName: "Yigʻuvchi", audienceBranchName: "Toshkent" }), t)).toBe(
      "Yigʻuvchi · Toshkent",
    );
    expect(threadTitle(thread({ audience: "ROLE", audienceRoleName: "Yigʻuvchi" }), t)).toBe("Yigʻuvchi · Barcha filiallar");
    expect(threadTitle(thread({ audience: "BRANCH", audienceBranchName: "Samarqand" }), t)).toBe("Butun filial · Samarqand");
    const many = thread({ others: [person(2, "A"), person(3, "B"), person(4, "C"), person(5, "D")], participantCount: 6 });
    expect(threadTitle(many, t)).toBe("A, B, C +2");
  });

  it("fayl: boʻsh emas, ≤ 20 MB; hajm koʻrinishi", () => {
    expect(fileProblem({ size: 0 })).toBe("empty");
    expect(fileProblem({ size: 20 * 1024 * 1024 + 1 })).toBe("size");
    expect(fileProblem({ size: 20 * 1024 * 1024 })).toBeNull();
    expect(formatSize(1536 * 1024)).toBe("1,5 MB");
    expect(formatSize(300)).toBe("1 KB");
  });

  it("muddat maydoni ISO ga", () => {
    expect(dueToIso("")).toBeNull();
    expect(dueToIso("xato")).toBeNull();
    expect(dueToIso("2026-11-20T17:00")).toBe(new Date("2026-11-20T17:00").toISOString());
  });
});
