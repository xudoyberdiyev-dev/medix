/** Shartli CSS klasslarini birlashtiradi: `cn("a", cond && "b")`. */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}
