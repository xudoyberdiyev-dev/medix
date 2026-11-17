import type { ThreadSummary } from "./api";

type T = (key: "allBranches" | "wholeBranch" | "deletedUser") => string;

/** Suhbat nomi: shaxsiy — suhbatdosh; tanlangan xodimlar — ismlar; rol — «Yigʻuvchilar · Filial»; filial — «Butun filial · Filial». */
export function threadTitle(th: ThreadSummary, t: T): string {
  switch (th.audience) {
    case "PERSON":
      return th.others[0]?.fullName ?? t("deletedUser");
    case "ROLE":
      return `${th.audienceRoleName ?? th.audienceRole ?? ""} · ${th.audienceBranchName ?? t("allBranches")}`;
    case "BRANCH":
      return `${t("wholeBranch")} · ${th.audienceBranchName ?? ""}`;
    default: {
      const names = th.others.slice(0, 3).map((p) => p.fullName);
      const rest = th.participantCount - 1 - names.length;
      return rest > 0 ? `${names.join(", ")} +${rest}` : names.join(", ");
    }
  }
}

/** Avatar uchun nom: shaxsiy — suhbatdosh, guruh — sarlavha. */
export function threadAvatarName(th: ThreadSummary, t: T): string {
  return th.audience === "PERSON" ? (th.others[0]?.fullName ?? "?") : threadTitle(th, t);
}
