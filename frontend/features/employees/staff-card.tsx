"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Ban,
  Building2,
  Check,
  CircleCheck,
  CircleX,
  Copy,
  KeyRound,
  Lock,
  LockOpen,
  LogOut,
  RotateCcwKey,
  ShieldCheck,
  History,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DocumentHeader } from "@/components/ui/document-header";
import { Icon } from "@/components/ui/icon";
import { Modal, Consequences } from "@/components/ui/modal";
import { RowMenu, type RowMenuItem } from "@/components/ui/row-menu";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { isKnownAction } from "@/features/audit/actions";
import { can as canMe } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { useWarehouses } from "@/features/organization/api";
import { AllBranchesDialog } from "./all-branches-dialog";
import { useRoleMatrix } from "@/features/roles/roles-matrix";
import { api, unwrap } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  useBlockEmployee,
  useBranches,
  useEmployeeJournal,
  useEmployees,
  useEndSessions,
  useResetPassword,
  useResetPin,
  useUnblockEmployee,
  useUpdateEmployee,
  useSeats,
  type Employee,
  type EmployeeJournal,
} from "./api";
import { displayName, generatePassword, staffStatus, type StaffStatus } from "./staff";

type Tab = "info" | "perm" | "logins" | "acts";
type LoginRow = EmployeeJournal["logins"][number];
type ActRow = EmployeeJournal["actions"][number];
type Dlg =
  | { kind: "rule"; title: string; text: string }
  | { kind: "role"; role: string; branch: number | null }
  | { kind: "roleConfirm"; role: string; branch: number | null }
  | { kind: "branch"; branch: number | null }
  | { kind: "block" | "unblock" | "pw" | "pin" | "sess" | "allBranches" }
  | null;

const STATUS: Record<StaffStatus, { tone: "info" | "success" | "danger"; icon: typeof KeyRound }> = {
  new: { tone: "info", icon: KeyRound },
  active: { tone: "success", icon: CircleCheck },
  blocked: { tone: "danger", icon: Ban },
};

const dt = (iso?: string | null) => (iso ? formatDateTime(new Date(iso)) : "");

function InfoGrid({ title, rows }: { title: string; rows: [string, ReactNode, boolean?][] }) {
  return (
    <section className="max-w-[820px] rounded-card border border-border bg-surface">
      <h2 className="border-b border-border px-5 py-3 text-[15px] font-semibold">{title}</h2>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 px-5 py-4 sm:grid-cols-2">
        {rows.map(([label, value, mono]) => (
          <div key={label} className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-caption text-text-secondary">{label}</dt>
            <dd className={cn("text-body break-words", mono && value ? "font-mono text-[13px]" : "", value ? "" : "text-text-disabled")}>
              {value || "—"}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * Xodim kartasi (prototip AdminStaff): sarlavha (avatar, Xodimlar / ism, holat, rol · filial, login; «Rolni oʻzgartirish» va «…» —
 * filial, yangi parol, PIN, sessiyalar, bloklash), yorliqlar Maʼlumot / Ruxsatlar / Kirishlar / Harakatlar va qoidalar
 * (oʻzini, oxirgi Direktorni bloklab yoki rolini oʻzgartirib boʻlmaydi; chegara).
 */
export function StaffCardPage({ id }: { id: number }) {
  const t = useTranslations("staff.card");
  const te = useTranslations("employees.allBranches");
  const ts = useTranslations("staff");
  const tr = useTranslations("roles");
  const ta = useTranslations("audit");
  const tx = tr as unknown as { (key: string): string; has: (key: string) => boolean };
  const me = useMe();
  const list = useEmployees();
  const journal = useEmployeeJournal(id);
  const matrix = useRoleMatrix();
  const branchesQ = useBranches();
  const warehousesQ = useWarehouses();
  const seatsQ = useSeats();
  const update = useUpdateEmployee();
  const block = useBlockEmployee();
  const unblock = useUnblockEmployee();
  const resetPw = useResetPassword();
  const resetPin = useResetPin();
  const endSess = useEndSessions();
  const [tab, setTab] = useState<Tab>("info");
  const [dlg, setDlg] = useState<Dlg>(null);
  const [reason, setReason] = useState("");
  const [reasonTried, setReasonTried] = useState(false);
  const [creds, setCreds] = useState<{ login: string; pw: string } | null>(null);

  const e = (list.data ?? []).find((x) => x.id === id);
  const cashQ = useQuery({
    queryKey: ["money-accounts", "list", e?.branchId ?? 0],
    queryFn: () => unwrap(api.GET("/api/money-accounts", { params: { query: { branchId: e?.branchId ?? 0 } } })),
    enabled: !!e?.branchId && (e?.cashAccountIds.length ?? 0) > 0,
    retry: false,
  });

  if (list.error || matrix.error)
    return <ErrorState description={t("loadErr")} onRetry={() => void Promise.all([list.refetch(), matrix.refetch()])} />;
  if (!list.data || !matrix.data)
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  if (!e)
    return (
      <div className="rounded-card border border-border bg-surface">
        <EmptyState
          icon={UsersRound}
          title={t("notFoundT")}
          description={t("notFound")}
          action={
            <Link href="/settings/employees" className="text-table font-medium text-primary-button hover:underline">
              {t("pageT")}
            </Link>
          }
        />
      </div>
    );

  const emps = list.data;
  const ro = !canMe(me.data, "staff.edit");
  const roles = matrix.data.roles;
  const grants = matrix.data.grants as Record<string, string[] | undefined>;
  const perms = matrix.data.permissions;
  const roleOf = (code: string) => roles.find((r) => r.code === code);
  const roleName = (code: string) => roleOf(code)?.name ?? code;
  const scope = (code: string) => (roleOf(code)?.scope === "all" ? "all" : "own");
  const permSet = (code: string) => (code === "DIRECTOR" ? perms.map((p) => p.key) : (grants[code] ?? []));
  const permName = (key: string) => {
    const k = `perm.${key.replace(".", "_")}`;
    return tx.has(k) ? tx(k) : (perms.find((p) => p.key === key)?.description ?? key);
  };
  const branches = branchesQ.data ?? [];
  const brName = (b?: number | null) => (b ? (branches.find((x) => x.id === b)?.name ?? "—") : ts("scAll"));
  const nm = displayName(e);
  const st = staffStatus(e);
  const off = e.status === "BLOCKED";
  const self = e.id === me.data?.id;
  const activeDirectors = emps.filter((x) => x.roleCode === "DIRECTOR" && x.status !== "BLOCKED").length;
  const lastDirector = e.roleCode === "DIRECTOR" && activeDirectors <= 1;
  const P = permSet(e.roleCode);
  // Tasdiqlash (approve) ruxsati boʻlsa — PIN bilan tasdiqlaydi
  const pinNeeded = P.some((k) => perms.find((p) => p.key === k)?.kind === "approve") || !!journal.data?.pinSet;
  const sessions = journal.data?.sessions ?? 0;
  const rule = (title: string, text: string) => setDlg({ kind: "rule", title, text });

  const body = (x: Employee, patch: Partial<{ roleCode: string; branchId: number | null }>) => {
    const roleCode = patch.roleCode ?? x.roleCode;
    const branchId = patch.branchId !== undefined ? patch.branchId : (x.branchId ?? null);
    const keep = roleCode === x.roleCode && branchId === (x.branchId ?? null);
    return {
      login: x.login,
      lastName: x.lastName ?? "",
      firstName: x.firstName ?? "",
      middleName: x.middleName ?? undefined,
      phone: x.phone ?? undefined,
      position: x.position ?? undefined,
      roleCode,
      branchId: branchId ?? undefined,
      warehouseIds: keep ? x.warehouseIds : [],
      cashAccountIds: keep ? x.cashAccountIds : [],
    };
  };

  const askRole = () => {
    if (self) return rule(t("rSelfT"), t("rSelfRole"));
    if (lastDirector) return rule(t("rLastDirT"), t("rLastDirRole"));
    setDlg({ kind: "role", role: e.roleCode, branch: e.branchId ?? null });
  };
  const askBranch = () => {
    if (scope(e.roleCode) === "all") return rule(t("ruleT"), t("rAllBr", { r: roleName(e.roleCode) }));
    setDlg({ kind: "branch", branch: e.branchId ?? null });
  };
  const askBlock = () => {
    if (self) return rule(t("rSelfT"), t("rSelfBlock"));
    if (lastDirector) return rule(t("rLastDirT"), t("rLastDir"));
    setReason("");
    setReasonTried(false);
    setDlg({ kind: "block" });
  };
  const askUnblock = () => {
    const seats = seatsQ.data;
    if (seats?.limit != null && seats.used >= seats.limit) return rule(t("rLimitT"), t("rLimit", { m: seats.limit, n: seats.used }));
    setDlg({ kind: "unblock" });
  };
  const askSess = () => {
    if (!sessions) return toast({ tone: "info", title: t("noSess") });
    setDlg({ kind: "sess" });
  };

  const more: RowMenuItem[] = ro
    ? []
    : [
        { key: "branch", label: t("aBranch"), icon: <Icon icon={Building2} />, onSelect: askBranch },
        { key: "pw", label: t("aPw"), icon: <Icon icon={KeyRound} />, onSelect: () => setDlg({ kind: "pw" }) },
        ...(pinNeeded
          ? [{ key: "pin", label: t("aPin"), icon: <Icon icon={RotateCcwKey} />, onSelect: () => setDlg({ kind: "pin" }) }]
          : []),
        // E3: Buxgalterga barcha filiallar — faqat Direktor beradi
        ...(me.data?.role.code === "DIRECTOR" && e.roleCode === "ACCOUNTANT"
          ? [
              {
                key: "allBranches",
                label: e.allBranches ? te("revoke") : te("grant"),
                icon: <Icon icon={Building2} />,
                onSelect: () => setDlg({ kind: "allBranches" }),
              },
            ]
          : []),
        { key: "sess", label: t("aSess"), icon: <Icon icon={LogOut} />, onSelect: askSess },
        off
          ? { key: "unblock", label: t("aUnblock"), icon: <Icon icon={LockOpen} />, onSelect: askUnblock }
          : { key: "block", label: t("aBlock"), icon: <Icon icon={Ban} />, onSelect: askBlock },
      ];

  const whNames = (warehousesQ.data ?? [])
    .filter((w) => e.warehouseIds.includes(w.id))
    .map((w) => w.name)
    .join(", ");
  const cashNames = (cashQ.data ?? [])
    .filter((a) => e.cashAccountIds.includes(a.id))
    .map((a) => a.name)
    .join(", ");
  const info: [string, ReactNode, boolean?][] = [
    [t("fFio"), [e.lastName, e.firstName, e.middleName].filter(Boolean).join(" ") || e.fullName],
    [ts("cRole"), roleName(e.roleCode)],
    [ts("cBranch"), brName(e.branchId)],
    [ts("cLogin"), e.login, true],
    [ts("cPhone"), e.phone ?? "", true],
    ...(e.warehouseIds.length ? ([[t("fWhs"), whNames]] as [string, ReactNode][]) : []),
    ...(e.cashAccountIds.length ? ([[t("fCash"), cashNames]] as [string, ReactNode][]) : []),
    [t("lastLogin"), e.lastLoginAt ? dt(e.lastLoginAt) : t("never")],
    ...(pinNeeded
      ? ([
          [
            t("pinL"),
            journal.data?.pinSet && journal.data.pinSetAt
              ? t("pinSetOn", { d: formatDate(new Date(journal.data.pinSetAt)) })
              : t("pinNotSet"),
          ],
        ] as [string, ReactNode][])
      : []),
    ...(off ? ([[t("blockReason"), e.blockedReason ?? ""]] as [string, ReactNode][]) : []),
  ];

  const logins = journal.data?.logins ?? [];
  const acts = journal.data?.actions ?? [];
  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "info", label: t("tInfo") },
    { key: "perm", label: t("tPerm"), count: P.length },
    { key: "logins", label: t("tLogins"), count: logins.length },
    { key: "acts", label: t("tActs"), count: acts.length },
  ];

  const groups = [...new Set(perms.map((p) => p.group))].map((g) => {
    const all = perms.filter((p) => p.group === g);
    const items = all.filter((p) => P.includes(p.key)).map((p) => permName(p.key));
    return { g, name: tx.has(`matrix.groups.${g}`) ? tx(`matrix.groups.${g}`) : g, items, total: all.length };
  });

  const loginCols: TableColumn<LoginRow>[] = [
    { key: "at", title: t("cTime"), width: 170, mono: true, render: (r) => dt(r.at) },
    {
      key: "result",
      title: t("cResult"),
      width: 200,
      render: (r) => {
        const ok = r.result === "OK";
        return (
          <span className={cn("flex items-center gap-1.5 font-medium", ok ? "text-success" : "text-danger")}>
            <Icon icon={ok ? CircleCheck : CircleX} className="size-[15px]" />
            {ok ? t("lOk") : r.result === "BLOCKED" ? t("lBlocked") : t("lFail")}
          </span>
        );
      },
    },
    {
      key: "device",
      title: t("cDevice"),
      render: (r) => <span className="text-text-secondary">{[r.device, r.ip].filter(Boolean).join(" · ") || "—"}</span>,
    },
  ];
  const actCols: TableColumn<ActRow>[] = [
    { key: "at", title: t("cTime"), width: 170, mono: true, render: (r) => dt(r.at) },
    {
      key: "action",
      title: t("cAction"),
      render: (r) => <span className="font-medium">{isKnownAction(r.action) ? ta(`actions.${r.action}`) : r.action}</span>,
    },
    {
      key: "obj",
      title: t("cObject"),
      render: (r) => (
        <span className="text-text-secondary">
          {[r.entityType + (r.entityId ? ` #${r.entityId}` : ""), r.reason].filter(Boolean).join(" · ")}
        </span>
      ),
    },
  ];

  // Rol almashtirishda ruxsatlar farqi
  const diff = (to: string) => {
    const a = permSet(e.roleCode);
    const b = permSet(to);
    return { add: b.filter((k) => !a.includes(k)), rem: a.filter((k) => !b.includes(k)) };
  };
  const roleItems = (to: string) => {
    const { add, rem } = diff(to);
    const list6 = (ks: string[], sign: string) => [
      ...ks.slice(0, 6).map((k) => `${sign} ${permName(k)}`),
      ...(ks.length > 6 ? [t("andMore", { n: ks.length - 6 })] : []),
    ];
    return [...list6(add, "+"), ...list6(rem, "−")];
  };

  const saveRole = (role: string, branch: number | null) =>
    update.mutate(
      { id: e.id, body: body(e, { roleCode: role, branchId: scope(role) === "all" ? null : branch }) },
      {
        onSuccess: () => {
          setDlg(null);
          toast({ tone: "success", title: t("roleDone", { n: nm, r: roleName(role) }) });
        },
      },
    );

  const reasonField = (
    <TextField
      label={t("reasonReq")}
      required
      value={reason}
      onChange={setReason}
      error={reasonTried && !reason.trim() ? t("eReason") : undefined}
    />
  );
  const withReason = (run: (r: string) => void) => {
    if (!reason.trim()) {
      setReasonTried(true);
      return;
    }
    run(reason.trim());
  };

  return (
    <div className="flex flex-col gap-[20px]">
      <div className="flex items-start gap-3.5">
        <span className="mt-[22px] flex-none">
          <Avatar name={nm} decorative />
        </span>
        <DocumentHeader
          className="min-w-0 flex-1"
          parent={{ label: t("pageT"), href: "/settings/employees" }}
          crumb={nm}
          title={nm}
          status={
            <span className="flex flex-wrap items-center gap-1.5">
              <Badge tone={STATUS[st].tone} icon={STATUS[st].icon}>
                {ts(`st.${st}`)}
              </Badge>
              {e.allBranches && e.roleCode === "ACCOUNTANT" ? (
                <Badge tone="info" icon={Building2}>
                  {te("badge")}
                </Badge>
              ) : null}
            </span>
          }
          sub={
            <span>
              {`${roleName(e.roleCode)} · ${brName(e.branchId)} · `}
              <span className="font-mono">{e.login}</span>
            </span>
          }
          actions={
            ro ? (
              <Badge tone="neutral" icon={Lock}>
                {t("readOnly")}
              </Badge>
            ) : (
              <>
                <RowMenu label={t("more")} items={more} />
                <Button icon={ShieldCheck} onClick={askRole}>
                  {t("aRole")}
                </Button>
              </>
            )
          }
        />
      </div>

      <Tabs aria-label={t("tabsLabel")} items={tabs} value={tab} onChange={(k) => setTab(k as Tab)} />

      {tab === "info" ? <InfoGrid title={t("igPersonal")} rows={info} /> : null}

      {tab === "perm" ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-table text-text-secondary">
              {t("permHead", { n: P.length, m: perms.length, r: roleName(e.roleCode) })}
            </span>
            {!ro ? (
              <Link href="/settings/roles" className="flex items-center gap-1 text-table font-medium text-primary-button hover:underline">
                {t("changeRoleLink")}
                <Icon icon={ArrowUpRight} className="size-3.5" />
              </Link>
            ) : null}
          </div>
          <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
            {groups.map((g) => (
              <div key={g.g} className="flex flex-col gap-2 rounded-card border border-border bg-surface px-4 py-3.5">
                <div className="flex justify-between gap-2">
                  <span className="text-table font-semibold">{g.name}</span>
                  <span className="text-caption text-text-muted">{t("ofN", { a: g.items.length, b: g.total })}</span>
                </div>
                {g.items.map((x) => (
                  <div key={x} className="flex items-start gap-2 text-table">
                    <Icon icon={Check} className="mt-0.5 size-3.5 text-success" />
                    <span>{x}</span>
                  </div>
                ))}
                {!g.items.length ? <span className="text-table text-text-muted">{t("noPerms")}</span> : null}
              </div>
            ))}
          </div>
        </>
      ) : null}

      {tab === "logins" || tab === "acts" ? (
        journal.error ? (
          <div className="rounded-card border border-border bg-surface">
            <ErrorState description={t("loadErr")} onRetry={() => journal.refetch()} />
          </div>
        ) : (
          <>
            {tab === "acts" && canMe(me.data, "audit.view") ? (
              <div className="flex justify-end">
                <Link href="/settings/audit" className="flex items-center gap-1 text-table font-medium text-primary-button hover:underline">
                  {t("openInAudit")}
                  <Icon icon={ArrowUpRight} className="size-3.5" />
                </Link>
              </div>
            ) : null}
            {tab === "logins" ? (
              <Table
                caption={t("tLogins")}
                columns={loginCols}
                rows={logins}
                rowKey={(r) => `${r.at}-${r.result}`}
                loading={journal.isLoading}
                emptyState={<EmptyState icon={History} title={t("noRows")} description={t("emptyD")} />}
              />
            ) : (
              <Table
                caption={t("tActs")}
                columns={actCols}
                rows={acts}
                rowKey={(r) => `${r.at}-${r.action}-${r.entityId ?? ""}`}
                loading={journal.isLoading}
                emptyState={<EmptyState icon={History} title={t("noRows")} description={t("emptyD")} />}
              />
            )}
          </>
        )
      ) : null}

      {dlg?.kind === "allBranches" ? <AllBranchesDialog employee={e} onClose={() => setDlg(null)} /> : null}

      <Modal
        open={dlg?.kind === "rule"}
        onClose={() => setDlg(null)}
        title={dlg?.kind === "rule" ? dlg.title : ""}
        size="sm"
        primaryAction={{ label: t("understood"), onClick: () => setDlg(null) }}
      >
        <p className="text-body text-pretty">{dlg?.kind === "rule" ? dlg.text : ""}</p>
      </Modal>

      <Modal
        open={dlg?.kind === "role"}
        onClose={() => setDlg(null)}
        title={t("pickRoleT", { n: nm })}
        size="sm"
        primaryAction={{
          label: t("next"),
          disabled: dlg?.kind !== "role" || dlg.role === e.roleCode || (scope(dlg.role) !== "all" && !dlg.branch),
          onClick: () => dlg?.kind === "role" && setDlg({ kind: "roleConfirm", role: dlg.role, branch: dlg.branch }),
        }}
        secondaryAction={{ label: t("cancel"), onClick: () => setDlg(null) }}
      >
        {dlg?.kind === "role" ? (
          <div className="flex flex-col gap-3.5">
            <div className="flex flex-col gap-1.5">
              {roles
                .filter((r) => r.active && r.code !== "DIRECTOR")
                .map((r) => (
                  <button
                    key={r.code}
                    type="button"
                    onClick={() => setDlg({ ...dlg, role: r.code, branch: scope(r.code) === "all" ? null : dlg.branch })}
                    className={cn(
                      "flex min-h-10 items-center justify-between gap-2 rounded-control border px-3 py-1.5 text-left text-body",
                      dlg.role === r.code ? "border-primary bg-primary-soft" : "border-border bg-surface",
                    )}
                  >
                    <span>{r.name + (r.code === e.roleCode ? ` · ${t("current")}` : "")}</span>
                    <span className="text-caption text-text-muted">{t("permN", { n: permSet(r.code).length })}</span>
                  </button>
                ))}
            </div>
            {scope(dlg.role) !== "all" && !dlg.branch ? (
              <div className="flex flex-col gap-1.5">
                <span className="text-table font-medium">{ts("cBranch")}</span>
                <div className="flex flex-wrap gap-1.5">
                  {branches.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setDlg({ ...dlg, branch: b.id })}
                      className="h-[34px] rounded-control border border-border bg-surface px-3 text-table"
                    >
                      {b.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={dlg?.kind === "roleConfirm"}
        onClose={() => setDlg(null)}
        title={dlg?.kind === "roleConfirm" ? t("roleT", { n: nm, a: roleName(e.roleCode), b: roleName(dlg.role) }) : ""}
        size="sm"
        tone={dlg?.kind === "roleConfirm" && diff(dlg.role).rem.length > 0 ? "danger" : "default"}
        primaryAction={{
          label: t("roleOk"),
          loading: update.isPending,
          onClick: () => dlg?.kind === "roleConfirm" && saveRole(dlg.role, dlg.branch),
        }}
        secondaryAction={{ label: t("cancel"), onClick: () => setDlg(null) }}
      >
        {dlg?.kind === "roleConfirm" ? (
          <div className="flex flex-col gap-3">
            <p className="text-body">{t("roleDiff", { a: diff(dlg.role).add.length, r: diff(dlg.role).rem.length })}</p>
            <Consequences items={roleItems(dlg.role)} />
          </div>
        ) : null}
      </Modal>

      <Modal
        open={dlg?.kind === "branch"}
        onClose={() => setDlg(null)}
        title={t("pickBrT", { n: nm })}
        size="sm"
        primaryAction={{
          label: t("next"),
          loading: update.isPending,
          disabled: dlg?.kind !== "branch" || dlg.branch === (e.branchId ?? null),
          onClick: () => {
            if (dlg?.kind !== "branch" || !dlg.branch) return;
            const b = dlg.branch;
            update.mutate(
              { id: e.id, body: body(e, { branchId: b }) },
              {
                onSuccess: () => {
                  setDlg(null);
                  toast({ tone: "success", title: t("brDone", { n: nm, b: brName(b) }) });
                },
              },
            );
          },
        }}
        secondaryAction={{ label: t("cancel"), onClick: () => setDlg(null) }}
      >
        {dlg?.kind === "branch" ? (
          <div className="flex flex-col gap-3.5">
            <div className="flex flex-col gap-1.5">
              {branches.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setDlg({ kind: "branch", branch: b.id })}
                  className={cn(
                    "flex min-h-10 items-center justify-between gap-2 rounded-control border px-3 py-1.5 text-left text-body",
                    dlg.branch === b.id ? "border-primary bg-primary-soft" : "border-border bg-surface",
                  )}
                >
                  <span>{b.name + (b.id === e.branchId ? ` · ${t("current")}` : "")}</span>
                  <span className="text-caption text-text-muted">{b.code}</span>
                </button>
              ))}
            </div>
            {dlg.branch !== (e.branchId ?? null) ? (
              <p className="rounded-control border border-border bg-warning-bg px-3 py-2.5 text-table text-warning">
                {t("brWarn0", { b: brName(e.branchId) })}
              </p>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={dlg?.kind === "block"}
        onClose={() => setDlg(null)}
        title={t("blockT", { n: nm })}
        size="sm"
        tone="danger"
        primaryAction={{
          label: t("blockOk"),
          loading: block.isPending,
          onClick: () =>
            withReason((r) =>
              block.mutate(
                { id: e.id, reason: r },
                {
                  onSuccess: () => {
                    setDlg(null);
                    toast({ tone: "success", title: t("blocked", { n: nm }) });
                  },
                },
              ),
            ),
        }}
        secondaryAction={{ label: t("cancel"), onClick: () => setDlg(null) }}
      >
        <div className="flex flex-col gap-3">
          <p className="text-body">{t("blockText", { s: sessions })}</p>
          {reasonField}
        </div>
      </Modal>

      <Modal
        open={dlg?.kind === "unblock"}
        onClose={() => setDlg(null)}
        title={t("unblockT", { n: nm })}
        size="sm"
        primaryAction={{
          label: t("unblockOk"),
          loading: unblock.isPending,
          onClick: () =>
            unblock.mutate(e.id, {
              onSuccess: () => {
                setDlg(null);
                toast({ tone: "success", title: t("unblocked", { n: nm }) });
              },
            }),
        }}
        secondaryAction={{ label: t("cancel"), onClick: () => setDlg(null) }}
      >
        <p className="text-body">{t("unblockText")}</p>
      </Modal>

      <Modal
        open={dlg?.kind === "pw"}
        onClose={() => setDlg(null)}
        title={ts("pwT")}
        size="sm"
        primaryAction={{
          label: ts("pwOk"),
          loading: resetPw.isPending,
          onClick: () => {
            const pw = generatePassword();
            resetPw.mutate(
              { id: e.id, temporaryPassword: pw },
              {
                onSuccess: (saved) => {
                  setDlg(null);
                  setCreds({ login: saved.login, pw });
                },
              },
            );
          },
        }}
        secondaryAction={{ label: t("cancel"), onClick: () => setDlg(null) }}
      >
        <p className="text-body">{ts("pwText")}</p>
      </Modal>

      <Modal
        open={dlg?.kind === "pin"}
        onClose={() => setDlg(null)}
        title={t("pinT")}
        size="sm"
        primaryAction={{
          label: t("pinOk"),
          loading: resetPin.isPending,
          onClick: () =>
            resetPin.mutate(e.id, {
              onSuccess: () => {
                setDlg(null);
                toast({ tone: "success", title: t("pinDone") });
              },
            }),
        }}
        secondaryAction={{ label: t("cancel"), onClick: () => setDlg(null) }}
      >
        <p className="text-body">{t("pinText")}</p>
      </Modal>

      <Modal
        open={dlg?.kind === "sess"}
        onClose={() => setDlg(null)}
        title={t("sessT")}
        size="sm"
        tone="danger"
        primaryAction={{
          label: t("sessOk"),
          loading: endSess.isPending,
          onClick: () =>
            endSess.mutate(e.id, {
              onSuccess: () => {
                setDlg(null);
                toast({ tone: "success", title: t("sessDone") });
              },
            }),
        }}
        secondaryAction={{ label: t("cancel"), onClick: () => setDlg(null) }}
      >
        <p className="text-body">{t("sessText", { n: sessions })}</p>
      </Modal>

      <Modal
        open={!!creds}
        onClose={() => setCreds(null)}
        title={ts("crT")}
        size="sm"
        primaryAction={{ label: t("done"), onClick: () => setCreds(null) }}
        secondaryAction={{
          label: t("copy"),
          onClick: () => {
            if (!creds) return;
            void navigator.clipboard?.writeText(`${window.location.origin}/login\n${creds.login}\n${creds.pw}`);
            toast({ tone: "success", title: t("copied") });
          },
        }}
      >
        {creds ? (
          <div className="flex flex-col gap-3.5">
            <dl className="rounded-control border border-border bg-background px-3.5 py-1">
              {[
                [ts("cName"), nm],
                [ts("cLogin"), creds.login],
                [t("newPw"), creds.pw],
                [ts("crUrl"), typeof window === "undefined" ? "" : `${window.location.origin}/login`],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-b border-border-subtle py-2 last:border-b-0">
                  <dt className="text-table text-text-secondary">{k}</dt>
                  <dd className="font-mono text-table font-medium break-all">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="flex items-start gap-2 text-table text-warning">
              <Icon icon={Copy} className="mt-0.5 size-3.5" />
              {t("pwOnce")}
            </p>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
