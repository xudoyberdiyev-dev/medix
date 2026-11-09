/** Maʼlum amal kalitlari — nomi `audit.actions.<kalit>` dan. Nomaʼlum kalit oʻzi koʻrsatiladi. */
export const AUDIT_ACTIONS = [
  "auth.login",
  "auth.loginFailed",
  "auth.loginBlocked",
  "auth.passwordChanged",
  "employee.create",
  "employee.block",
  "employee.unblock",
  "employee.resetPassword",
  "employee.update",
  "employee.endSessions",
  "employee.resetPin",
  "company.create",
  "company.update",
  "branch.create",
  "branch.update",
  "warehouse.create",
  "setup.complete",
] as const;
type AuditAction = (typeof AUDIT_ACTIONS)[number];

export function isKnownAction(a: string): a is AuditAction {
  return (AUDIT_ACTIONS as readonly string[]).includes(a);
}
