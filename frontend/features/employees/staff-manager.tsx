"use client";

import { useQueries } from "@tanstack/react-query";
import {
  Ban,
  Building2,
  Check,
  CircleCheck,
  Copy,
  Eye,
  EyeOff,
  Info,
  KeyRound,
  LockOpen,
  Pencil,
  Plus,
  TriangleAlert,
  UsersRound,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Icon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/modal";
import { MultiFilter } from "@/components/ui/multi-filter";
import { RowMenu, type RowMenuItem } from "@/components/ui/row-menu";
import { Select } from "@/components/ui/select";
import { EmptyState, ErrorState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { Tabs } from "@/components/ui/tabs";
import { can as canMe } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { formatDateTime } from "@/lib/format";
import { useRoleMatrix } from "@/features/roles/roles-matrix";
import { describeError } from "@/features/setup/form-error";
import { api, unwrap } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import {
  useBlockEmployee,
  useCreateEmployee,
  useEmployees,
  useLoginCheck,
  useResetPassword,
  useSeats,
  useUnblockEmployee,
  useUpdateEmployee,
  type Employee,
} from "./api";
import {
  inView,
  STAFF_VIEWS,
  type StaffView,
  checkStaff,
  cleanLogin,
  displayName,
  formatPhone,
  generatePassword,
  initials,
  staffStatus,
  type StaffErrorKey,
  type StaffForm,
  type StaffStatus,
} from "./staff";

export interface StaffBranch {
  id: number;
  name: string;
}
export interface StaffWarehouse {
  id: number;
  branchId: number;
  name: string;
}

const STATUS: Record<StaffStatus, { tone: "info" | "success" | "danger"; icon: typeof KeyRound }> = {
  new: { tone: "info", icon: KeyRound },
  active: { tone: "success", icon: CircleCheck },
  blocked: { tone: "danger", icon: Ban },
};

const VIEW_LABEL: Record<StaffView, "vAll" | "vNever" | "vBlocked" | "vWeek"> = {
  all: "vAll",
  never: "vNever",
  blocked: "vBlocked",
  week: "vWeek",
};

const EMPTY: StaffForm = {
  last: "",
  first: "",
  mid: "",
  phone: "+998",
  role: "",
  branch: "",
  whs: [],
  cash: [],
  login: "",
  loginTouched: false,
};

type Panel = { id: number | null; form: StaffForm; pw: string | null; tried: boolean };
type Dialog = { kind: "warn"; text: string } | { kind: "pw"; emp: Employee } | { kind: "block"; emp: Employee } | null;

/**
 * Xodimlar (prototip WizStaff): ustaning 5-qadami. Hisoblagich (oʻrinlar), filiallar boʻyicha qamrov, filtrlar, jadval,
 * xodim paneli (Shaxsiy / Ish / Kirish: omborlar, kassa, login taklifi, bir martalik parol), kirish maʼlumotlari oynasi,
 * yangi parol va bloklash.
 */
export function StaffManager({
  branches,
  warehouses,
  stepOf,
  onBack,
  onNext,
  page = false,
  onOpenEmp,
}: {
  branches: StaffBranch[];
  warehouses: StaffWarehouse[];
  stepOf?: string;
  onBack?: () => void;
  onNext?: () => void;
  /** «Sozlamalar → Xodimlar» sahifasi (prototip AdminStaff): koʻrinishlar, «Oxirgi kirish», qator bosilsa — karta. */
  page?: boolean;
  onOpenEmp?: (e: Employee) => void;
}) {
  const t = useTranslations("staff");
  const tc = useTranslations("staff.card");
  const me = useMe();
  const list = useEmployees();
  const seatsQ = useSeats();
  const matrix = useRoleMatrix();
  const create = useCreateEmployee();
  const update = useUpdateEmployee();
  const block = useBlockEmployee();
  const unblock = useUnblockEmployee();
  const reset = useResetPassword();
  const cashes = useQueries({
    queries: branches.map((b) => ({
      queryKey: ["money-accounts", "list", b.id],
      queryFn: () => unwrap(api.GET("/api/money-accounts", { params: { query: { branchId: b.id } } })),
      retry: false,
    })),
    combine: (rs) => rs.flatMap((r) => (r.data ?? []).filter((a) => a.kind === "CASH" && a.active)),
  });

  const [q, setQ] = useState("");
  const [fRole, setFRole] = useState<string[]>([]);
  const [fBranch, setFBranch] = useState<string[]>([]);
  const [fStatus, setFStatus] = useState<StaffStatus[]>([]);
  const [view, setView] = useState<StaffView>("all");
  const [weekAgo] = useState(() => Date.now() - 7 * 24 * 3600 * 1000);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [showPw, setShowPw] = useState(false);
  const [dlg, setDlg] = useState<Dialog>(null);
  const [reason, setReason] = useState("");
  const [reasonTried, setReasonTried] = useState(false);
  const [creds, setCreds] = useState<{ emp: Employee; pw: string } | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const emps = useMemo(() => list.data ?? [], [list.data]);
  const roles = (matrix.data?.roles ?? []).filter((r) => r.active);
  const grants = matrix.data?.grants ?? {};
  const totalPerms = matrix.data?.permissions.length ?? 0;
  const roleOf = (code: string) => matrix.data?.roles.find((r) => r.code === code);
  const scope = (code: string): "all" | "own" => (roleOf(code)?.scope === "all" ? "all" : "own");
  const can = (code: string, key: string) => code === "DIRECTOR" || (grants[code] ?? []).includes(key);
  const branchName = (id?: number | null) => (id ? (branches.find((b) => b.id === id)?.name ?? "—") : t("scAll"));
  const seats = seatsQ.data ?? { used: emps.filter((e) => e.status !== "BLOCKED").length, limit: null };
  const limit = seats.limit ?? null;

  const pf = panel?.form ?? EMPTY;
  // Login taklifi: foydalanuvchi oʻzi yozmaguncha ism/familiyadan (serverda band loginlarga raqam qoʻshiladi)
  const suggestQ = useLoginCheck(panel && !pf.loginTouched ? { firstName: pf.first.trim(), lastName: pf.last.trim(), login: "" } : null);
  const f: StaffForm = pf.loginTouched ? pf : { ...pf, login: suggestQ.data?.suggested ?? "" };
  const loginQ = useLoginCheck(panel && f.login ? { firstName: "", lastName: "", login: f.login, exceptId: panel.id ?? undefined } : null);
  const loginBusy = loginQ.data?.available === false && !!f.login;

  const check = (p: Panel) => checkStaff({ form: f, id: p.id, scope, loginBusy, seats, employees: emps });
  const errs = panel?.tried ? check(panel).errors : [];
  const errText = (k: StaffErrorKey): string => {
    if (k === "login") return f.login ? t("eLoginBusy", { l: f.login }) : t("eLoginReq");
    if (k === "limit") return t("eLimit", { m: limit ?? 0 });
    const m = { last: "eLast", first: "eFirst", phone: "ePhone", role: "eRole", branch: "eBranch" } as const;
    return t(m[k]);
  };
  const err = (k: StaffErrorKey) => (errs.includes(k) ? errText(k) : undefined);

  const setF = (patch: Partial<StaffForm>) =>
    setPanel((p) => {
      if (!p) return p;
      const nf = { ...p.form, ...patch };
      // Taklif qilingan login saqlanadi (keyin ism oʻzgarsa ham yangilanaveradi, toki foydalanuvchi oʻzi yozmaguncha)
      if ("role" in patch) {
        if (scope(nf.role) === "all") nf.branch = "";
        nf.whs = [];
        nf.cash = [];
      }
      if ("branch" in patch) {
        nf.whs = [];
        nf.cash = [];
      }
      return { ...p, form: nf };
    });

  const openNew = () => {
    setShowPw(false);
    setPanel({ id: null, form: { ...EMPTY }, pw: generatePassword(), tried: false });
  };
  const openEdit = (e: Employee) =>
    setPanel({
      id: e.id,
      pw: null,
      tried: false,
      form: {
        last: e.lastName ?? e.fullName.split(/\s+/).slice(1).join(" "),
        first: e.firstName ?? e.fullName.split(/\s+/)[0] ?? "",
        mid: e.middleName ?? "",
        phone: e.phone ? formatPhone(e.phone) : "+998",
        role: e.roleCode,
        branch: e.branchId ? String(e.branchId) : "",
        whs: [...e.warehouseIds],
        cash: [...e.cashAccountIds],
        login: e.login,
        loginTouched: true,
      },
    });

  const focus = (k: StaffErrorKey) => {
    const el = bodyRef.current?.querySelector<HTMLElement>(`[data-f="${k === "limit" ? "last" : k}"]`);
    el?.querySelector<HTMLElement>("input,button")?.focus({ preventScroll: true });
    el?.scrollIntoView({ block: "center" });
  };

  const saving = create.isPending || update.isPending;
  const saveErr = describeError(create.error ?? update.error);

  async function save(ack: boolean) {
    if (!panel) return;
    const c = check(panel);
    if (c.errors.length) {
      setPanel({ ...panel, tried: true });
      return;
    }
    if (c.dupPhone && !ack) {
      setDlg({ kind: "warn", text: t("wDupPhone", { n: displayName(c.dupPhone), l: c.dupPhone.login }) });
      return;
    }
    setDlg(null);
    const fm = f;
    const branchId = scope(fm.role) === "all" || !fm.branch ? undefined : Number(fm.branch);
    const common = {
      login: fm.login,
      lastName: fm.last.trim(),
      firstName: fm.first.trim(),
      middleName: fm.mid.trim() || undefined,
      phone: fm.phone,
      roleCode: fm.role,
      branchId,
      warehouseIds: can(fm.role, "special.whs") ? fm.whs : [],
      cashAccountIds: can(fm.role, "special.till") ? fm.cash : [],
    };
    try {
      if (panel.id === null) {
        const pw = panel.pw ?? generatePassword();
        const saved = await create.mutateAsync({ ...common, temporaryPassword: pw });
        setPanel(null);
        setCreds({ emp: saved, pw });
      } else {
        const saved = await update.mutateAsync({ id: panel.id, body: common });
        setPanel(null);
        toast({ tone: "success", title: t("empUpd", { n: displayName(saved) }) });
      }
      create.reset();
      update.reset();
    } catch {
      // xato panelda koʻrsatiladi
    }
  }

  const copy = (text: string, msg: string) => {
    void navigator.clipboard?.writeText(text).catch(() => undefined);
    toast({ tone: "success", title: msg });
  };
  const loginUrl = typeof window === "undefined" ? "" : `${window.location.origin}/login`;

  // Filiallar boʻyicha qamrov
  const live = emps.filter((e) => e.status !== "BLOCKED");
  const cov = branches.map((b) => {
    const has = (pred: (e: Employee) => boolean) => live.filter((e) => e.branchId === b.id && pred(e));
    const row = (label: string, pred: (e: Employee) => boolean) => {
      const x = has(pred);
      return { label, value: x.length ? x.map(displayName).join(", ") : t("covNo", { r: label }), missing: !x.length };
    };
    const bc = cashes.filter((a) => a.branchId === b.id);
    const ok = bc.filter((a) => live.some((e) => e.cashAccountIds.includes(a.id)));
    const cashVal = !bc.length
      ? t("covNoCash")
      : ok.length === bc.length
        ? t("covCash", { a: ok.length, b: bc.length })
        : t("covCashNo", {
            k: bc
              .filter((a) => !ok.includes(a))
              .map((a) => a.name)
              .join(", "),
          });
    return {
      id: b.id,
      title: b.name,
      rows: [
        row(t("cov.branch"), (e) => can(e.roleCode, "approvals.branch") && e.roleCode !== "DIRECTOR"),
        row(t("cov.operator"), (e) => roleOf(e.roleCode)?.home === "operator"),
        row(t("cov.keeper"), (e) => can(e.roleCode, "special.whs") && e.roleCode !== "DIRECTOR"),
        { label: t("covCashL"), value: cashVal, missing: bc.length > 0 && ok.length < bc.length },
      ],
    };
  });

  const ql = q.trim().toLocaleLowerCase("uz");
  const ro = page && !canMe(me.data, "staff.edit");
  const rows = emps.filter(
    (e) =>
      (!page || inView(e, view, weekAgo)) &&
      (!ql || `${displayName(e)} ${e.fullName} ${e.login}`.toLocaleLowerCase("uz").includes(ql)) &&
      (!fRole.length || fRole.includes(e.roleCode)) &&
      (!fBranch.length || fBranch.includes(e.branchId ? String(e.branchId) : "ALL")) &&
      (!fStatus.length || fStatus.includes(staffStatus(e))),
  );
  const only = emps.length <= 1 && emps.every((e) => e.roleCode === "DIRECTOR");
  const cntBy = (pred: (e: Employee) => boolean) => emps.filter(pred).length;

  const columns: TableColumn<Employee>[] = [
    {
      key: "name",
      title: t("cName"),
      render: (e) => (
        <span className="flex min-w-0 items-center gap-2.5">
          <Avatar name={displayName(e)} size="sm" decorative />
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-medium">{displayName(e)}</span>
            {e.middleName ? (
              <span className="truncate text-caption text-text-secondary">{`${e.lastName ?? ""} ${e.firstName ?? ""} ${e.middleName}`}</span>
            ) : null}
          </span>
        </span>
      ),
    },
    { key: "role", title: t("cRole"), render: (e) => roleOf(e.roleCode)?.name ?? e.roleName },
    { key: "branch", title: t("cBranch"), width: 130, render: (e) => branchName(e.branchId) },
    { key: "login", title: t("cLogin"), width: 150, mono: true },
    { key: "phone", title: t("cPhone"), width: 160, render: (e) => e.phone ?? "—" },
    ...(page
      ? [
          {
            key: "ll",
            title: tc("lastLogin"),
            width: 150,
            render: (e: Employee) =>
              e.lastLoginAt ? (
                <span className="font-mono">{formatDateTime(new Date(e.lastLoginAt))}</span>
              ) : (
                <span className="text-text-muted">{tc("never")}</span>
              ),
          },
        ]
      : []),
    {
      key: "status",
      title: t("cStatus"),
      width: 230,
      render: (e) => {
        const s = staffStatus(e);
        return (
          <Badge tone={STATUS[s].tone} icon={STATUS[s].icon}>
            {t(`st.${s}`)}
          </Badge>
        );
      },
    },
  ];

  const rowItems = (e: Employee): RowMenuItem[] => [
    { key: "edit", label: t("mEdit"), icon: <Icon icon={Pencil} />, onSelect: () => openEdit(e) },
    { key: "pw", label: t("mPw"), icon: <Icon icon={KeyRound} />, onSelect: () => setDlg({ kind: "pw", emp: e }) },
    ...(e.status === "BLOCKED"
      ? [
          {
            key: "unblock",
            label: t("mUnblock"),
            icon: <Icon icon={LockOpen} />,
            onSelect: () =>
              unblock.mutate(e.id, { onSuccess: () => toast({ tone: "success", title: t("unblocked", { n: displayName(e) }) }) }),
          },
        ]
      : e.roleCode === "DIRECTOR" || e.id === me.data?.id
        ? []
        : [
            {
              key: "block",
              label: t("mBlock"),
              icon: <Icon icon={Ban} />,
              onSelect: () => {
                setReason("");
                setReasonTried(false);
                setDlg({ kind: "block", emp: e });
              },
            },
          ]),
  ];

  const rr = f.role ? roleOf(f.role) : undefined;
  const brId = f.branch ? Number(f.branch) : null;
  const brWh = brId ? warehouses.filter((w) => w.branchId === brId) : [];
  const brCash = brId ? cashes.filter((a) => a.branchId === brId) : [];
  const showWh = !!f.role && can(f.role, "special.whs") && brId !== null && brWh.length > 0;
  const showCash = !!f.role && can(f.role, "special.till") && brCash.length > 0;
  const warn = limit !== null && seats.used >= limit - 2;
  const atLimit = limit !== null && seats.used >= limit;

  const addBtn = (
    <Button icon={Plus} onClick={openNew}>
      {t("add")}
    </Button>
  );

  return (
    <div className={cn("flex min-h-0 flex-col", stepOf && "min-h-[calc(100dvh-64px)]")}>
      <div className={cn("flex flex-1 flex-col gap-[20px] pb-[24px]", stepOf && "px-[24px] pt-[32px]")}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col">
            {stepOf ? <span className="text-caption font-medium text-primary-button">{stepOf}</span> : null}
            <h1 className={cn("text-[26px] leading-[32px] font-semibold tracking-[-0.01em]", stepOf && "mt-[6px]")}>
              {page ? tc("pageT") : t("t5")}
              {page ? <span className="ml-2 text-[18px] font-normal text-text-muted">{emps.length}</span> : null}
            </h1>
            <p className="mt-[8px] max-w-[720px] text-body text-pretty text-text-secondary">{page ? tc("pageSub") : t("d5")}</p>
          </div>
          {ro ? null : addBtn}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex h-[26px] items-center gap-1.5 rounded-control px-2.5 text-table font-medium",
              warn ? "bg-warning-bg text-warning" : "bg-background text-text-secondary",
            )}
          >
            <Icon icon={warn ? TriangleAlert : UsersRound} className="size-3.5" />
            {limit !== null ? t("cnt", { n: seats.used, m: limit }) : t("cntFree", { n: seats.used })}
          </span>
          {atLimit ? <span className="text-table text-warning">{t("limitT", { m: limit ?? 0 })}</span> : null}
        </div>

        {list.error ? (
          <div className="rounded-card border border-border bg-surface">
            <ErrorState description={t("loadErr")} onRetry={() => list.refetch()} />
          </div>
        ) : only && list.data ? (
          <div className="rounded-card border border-border bg-surface">
            <EmptyState icon={UsersRound} title={t("emptyT")} description={t("emptyD")} action={addBtn} />
          </div>
        ) : (
          <>
            <section className="flex flex-col gap-2" aria-label={t("covT")}>
              <span className="text-table font-semibold">{t("covT")}</span>
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                {cov.map((g) => (
                  <div key={g.id} className="rounded-card border border-border bg-surface">
                    <div className="border-b border-border-subtle px-4 py-3 text-table font-semibold">{g.title}</div>
                    <dl className="flex flex-col gap-2 px-4 py-3">
                      {g.rows.map((r) => (
                        <div key={r.label} className="flex flex-col gap-0.5">
                          <dt className="text-caption text-text-secondary">{r.label}</dt>
                          <dd className={cn("text-table", r.missing && "text-warning")}>{r.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
              </div>
            </section>

            {page ? (
              <Tabs
                aria-label={tc("pageT")}
                items={STAFF_VIEWS.map((k) => ({
                  key: k,
                  label: tc(VIEW_LABEL[k]),
                  count: emps.filter((e) => inView(e, k, weekAgo)).length,
                }))}
                value={view}
                onChange={(k) => setView(k as StaffView)}
              />
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <div className="w-[260px] max-w-full">
                <TextField
                  label={t("searchEmp")}
                  variant="search"
                  size="sm"
                  value={q}
                  onChange={setQ}
                  placeholder={t("searchEmp")}
                  className="[&>label]:sr-only"
                />
              </div>
              <MultiFilter
                label={t("cRole")}
                options={roles.map((r) => ({ value: r.code, label: r.name, count: cntBy((e) => e.roleCode === r.code) }))}
                selected={fRole}
                onChange={setFRole}
              />
              <MultiFilter
                label={t("cBranch")}
                options={[
                  { value: "ALL", label: t("scAll"), count: cntBy((e) => !e.branchId) },
                  ...branches.map((b) => ({ value: String(b.id), label: b.name, count: cntBy((e) => e.branchId === b.id) })),
                ]}
                selected={fBranch}
                onChange={setFBranch}
              />
              <MultiFilter
                label={t("cStatus")}
                options={(["new", "active", "blocked"] as const).map((k) => ({
                  value: k,
                  label: t(`st.${k}`),
                  count: cntBy((e) => staffStatus(e) === k),
                }))}
                selected={fStatus}
                onChange={setFStatus}
              />
              {fRole.length || fBranch.length || fStatus.length ? (
                <Button
                  variant="tertiary"
                  size="sm"
                  onClick={() => {
                    setFRole([]);
                    setFBranch([]);
                    setFStatus([]);
                  }}
                >
                  {t("clearAll")}
                </Button>
              ) : null}
            </div>

            <Table
              caption={t("t5")}
              columns={columns}
              rows={rows}
              rowKey={(e) => String(e.id)}
              loading={list.isLoading}
              onRowClick={onOpenEmp ?? openEdit}
              rowActions={ro ? undefined : (e) => <RowMenu items={rowItems(e)} label={t("rowMenu")} />}
              emptyState={<EmptyState icon={UsersRound} title={t("noRows")} description={t("searchEmp")} />}
            />
          </>
        )}
      </div>

      {onBack || onNext ? (
        <div className="sticky bottom-0 z-10 flex h-16 flex-none items-center justify-end gap-2 border-t border-border bg-surface px-6">
          {onBack ? (
            <Button variant="secondary" size="sm" onClick={onBack}>
              {t("back")}
            </Button>
          ) : null}
          {onNext ? (
            <Button size="sm" onClick={onNext}>
              {t("next")}
            </Button>
          ) : null}
        </div>
      ) : null}

      <Drawer
        open={!!panel}
        onClose={() => setPanel(null)}
        title={panel?.id ? t("editEmp") : t("newEmp")}
        actions={
          <div className="flex w-full justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setPanel(null)}>
              {t("cancel")}
            </Button>
            <Button size="sm" loading={saving} onClick={() => void save(false)}>
              {t("pSave")}
            </Button>
          </div>
        }
      >
        {panel ? (
          <div ref={bodyRef} className="flex flex-col">
            {errs.length ? (
              <Alert tone="danger" title={t("vsT", { n: errs.length })}>
                <ul className="mt-1 flex flex-col gap-1">
                  {errs.map((k) => (
                    <li key={k}>
                      <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => focus(k)}>
                        {errText(k)}
                      </button>
                    </li>
                  ))}
                </ul>
              </Alert>
            ) : null}
            {saveErr.message ? (
              <Alert tone="danger" title={t("saveErr")}>
                {saveErr.message}
              </Alert>
            ) : null}
            <section className="flex flex-col gap-4 border-b border-border-subtle pb-6">
              <h3 className="text-table font-semibold">{t("sPersonal")}</h3>
              <div data-f="last">
                <TextField label={t("fLast")} required value={f.last} onChange={(v) => setF({ last: v })} error={err("last")} />
              </div>
              <div data-f="first">
                <TextField label={t("fFirst")} required value={f.first} onChange={(v) => setF({ first: v })} error={err("first")} />
              </div>
              <TextField label={`${t("fMid")} (${t("opt")})`} value={f.mid} onChange={(v) => setF({ mid: v })} />
              <div data-f="phone" className="w-[220px] max-w-full">
                <TextField
                  label={t("fPhone")}
                  required
                  inputMode="tel"
                  placeholder="+998 90 123 45 67"
                  className="font-mono"
                  value={f.phone}
                  onChange={(v) => setF({ phone: formatPhone(v) })}
                  error={err("phone")}
                />
              </div>
            </section>

            <section className="flex flex-col gap-4 border-b border-border-subtle py-6">
              <h3 className="text-table font-semibold">{t("sWork")}</h3>
              <div data-f="role" className="flex flex-col gap-1.5">
                <Select
                  label={t("cRole")}
                  required
                  options={roles.map((r) => ({ value: r.code, label: r.name }))}
                  value={f.role || null}
                  onChange={(v) => setF({ role: v ?? "" })}
                  error={err("role")}
                  disabled={panel.id !== null && panel.id === me.data?.id}
                />
                {rr ? (
                  <span className="text-caption text-text-secondary">
                    {t("roleHint", {
                      n: rr.code === "DIRECTOR" ? totalPerms : (grants[rr.code] ?? []).length,
                      s: rr.scope === "all" ? t("scAll") : t("scOwn"),
                    })}
                  </span>
                ) : null}
              </div>
              {rr && rr.scope === "all" ? (
                <div className="flex flex-col gap-1.5">
                  <span className="text-caption font-medium">{t("cBranch")}</span>
                  <span className="inline-flex h-[26px] items-center gap-1.5 self-start rounded-control bg-primary-soft px-2.5 text-table font-medium text-primary-button">
                    <Icon icon={Building2} className="size-3.5" />
                    {t("scAll")}
                  </span>
                </div>
              ) : (
                <div data-f="branch">
                  <Select
                    label={t("cBranch")}
                    required
                    options={branches.map((b) => ({ value: String(b.id), label: b.name }))}
                    value={f.branch || null}
                    onChange={(v) => setF({ branch: v ?? "" })}
                    error={err("branch")}
                  />
                </div>
              )}
              {showWh ? (
                <div className="flex flex-col gap-2">
                  <span className="text-caption font-medium">{t("fWh")}</span>
                  <div className="flex flex-wrap gap-2">
                    {brWh.map((w) => {
                      const on = f.whs.includes(w.id);
                      return (
                        <button
                          key={w.id}
                          type="button"
                          role="checkbox"
                          aria-checked={on}
                          onClick={() => setF({ whs: on ? f.whs.filter((x) => x !== w.id) : [...f.whs, w.id] })}
                          className={cn(
                            "flex h-8 items-center gap-1.5 rounded-control border px-2.5 text-table",
                            on ? "border-primary bg-primary-soft" : "border-border bg-surface",
                          )}
                        >
                          <span
                            className={cn(
                              "flex size-4 items-center justify-center rounded-[4px] border text-white",
                              on ? "border-primary-button bg-primary-button" : "border-text-muted bg-surface",
                            )}
                          >
                            {on ? <Icon icon={Check} className="size-3" /> : null}
                          </span>
                          {w.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              {showCash ? (
                <Select
                  label={t("fCash")}
                  options={[{ value: "", label: t("fCashNone") }, ...brCash.map((a) => ({ value: String(a.id), label: a.name }))]}
                  value={f.cash[0] ? String(f.cash[0]) : ""}
                  onChange={(v) => setF({ cash: v ? [Number(v)] : [] })}
                />
              ) : null}
            </section>

            <section className="flex flex-col gap-4 pt-6">
              <h3 className="text-table font-semibold">{t("sAccess")}</h3>
              <div data-f="login" className="flex flex-col">
                <div className="w-[240px] max-w-full">
                  <TextField
                    label={t("cLogin")}
                    required
                    autoComplete="off"
                    spellCheck={false}
                    className="font-mono"
                    value={f.login}
                    onChange={(v) => setF({ login: cleanLogin(v), loginTouched: true })}
                    error={loginBusy ? t("eLoginBusy", { l: f.login }) : err("login")}
                  />
                </div>
                {f.login && !loginBusy && !err("login") && loginQ.data?.available ? (
                  <span className="mt-1.5 flex items-center gap-1.5 text-caption text-success">
                    <Icon icon={CircleCheck} className="size-3.5" />
                    {t("loginFree")}
                  </span>
                ) : null}
              </div>
              {panel.id === null && panel.pw ? (
                <div className="flex flex-col">
                  <span className="text-table font-medium">{t("fPw")}</span>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span className="h-[34px] w-[200px] rounded-control border border-border bg-background px-3 font-mono text-table leading-[32px] tracking-[0.04em]">
                      {showPw ? panel.pw : "••••••••••"}
                    </span>
                    <Button variant="secondary" size="sm" icon={showPw ? EyeOff : Eye} onClick={() => setShowPw(!showPw)}>
                      {showPw ? t("hide") : t("show")}
                    </Button>
                    <Button variant="tertiary" size="sm" onClick={() => setPanel({ ...panel, pw: generatePassword() })}>
                      {t("regen")}
                    </Button>
                  </div>
                </div>
              ) : null}
              <div className="flex gap-2.5 rounded-control border border-border-subtle bg-background px-3.5 py-3">
                <Icon icon={Info} className="mt-0.5 flex-none text-text-secondary" />
                <span className="text-table text-pretty text-text-secondary">{t("firstNote")}</span>
              </div>
            </section>
          </div>
        ) : null}
      </Drawer>

      <Modal
        open={dlg?.kind === "warn"}
        onClose={() => setDlg(null)}
        title={t("warnT")}
        size="sm"
        primaryAction={{ label: t("goOn"), onClick: () => void save(true), loading: saving }}
        secondaryAction={{ label: t("cancel"), onClick: () => setDlg(null) }}
      >
        <p className="text-body">{dlg?.kind === "warn" ? dlg.text : ""}</p>
      </Modal>

      <Modal
        open={dlg?.kind === "pw"}
        onClose={() => setDlg(null)}
        title={t("pwT")}
        size="sm"
        primaryAction={{
          label: t("pwOk"),
          loading: reset.isPending,
          onClick: () => {
            if (dlg?.kind !== "pw") return;
            const pw = generatePassword();
            const emp = dlg.emp;
            reset.mutate(
              { id: emp.id, temporaryPassword: pw },
              {
                onSuccess: (saved) => {
                  setDlg(null);
                  setCreds({ emp: saved, pw });
                },
              },
            );
          },
        }}
        secondaryAction={{ label: t("cancel"), onClick: () => setDlg(null) }}
      >
        <p className="text-body">{t("pwText")}</p>
      </Modal>

      <Modal
        open={dlg?.kind === "block"}
        onClose={() => setDlg(null)}
        title={dlg?.kind === "block" ? t("blockT", { n: displayName(dlg.emp) }) : ""}
        size="sm"
        tone="danger"
        primaryAction={{
          label: t("blockOk"),
          loading: block.isPending,
          onClick: () => {
            if (dlg?.kind !== "block") return;
            if (!reason.trim()) {
              setReasonTried(true);
              return;
            }
            const emp = dlg.emp;
            block.mutate(
              { id: emp.id, reason: reason.trim() },
              {
                onSuccess: () => {
                  setDlg(null);
                  toast({ tone: "success", title: t("blocked", { n: displayName(emp) }) });
                },
              },
            );
          },
        }}
        secondaryAction={{ label: t("cancel"), onClick: () => setDlg(null) }}
      >
        <div className="flex flex-col gap-3">
          <p className="text-body">{t("blockText")}</p>
          <TextField
            label={t("blockReason")}
            required
            value={reason}
            onChange={setReason}
            error={reasonTried && !reason.trim() ? t("blockReq") : undefined}
          />
        </div>
      </Modal>

      <Modal
        open={!!creds}
        onClose={() => setCreds(null)}
        title={t("crT")}
        primaryAction={{ label: t("done"), onClick: () => setCreds(null) }}
        secondaryAction={{
          label: t("copyAll"),
          onClick: () =>
            creds &&
            copy(
              `${displayName(creds.emp)}\n${t("cLogin")}: ${creds.emp.login}\n${t("fPw")}: ${creds.pw}\n${t("crUrl")}: ${loginUrl}`,
              t("allCopied"),
            ),
        }}
      >
        {creds ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <span className="flex size-10 flex-none items-center justify-center rounded-full bg-primary-soft text-[14px] font-semibold text-primary-button">
                {initials(creds.emp)}
              </span>
              <span className="text-table text-text-secondary">
                {[displayName(creds.emp), roleOf(creds.emp.roleCode)?.name ?? creds.emp.roleName, branchName(creds.emp.branchId)].join(
                  " · ",
                )}
              </span>
            </div>
            <div className="flex flex-col rounded-[10px] border border-border">
              {[
                { label: t("cLogin"), value: creds.emp.login },
                { label: t("fPw"), value: creds.pw },
              ].map((l) => (
                <div key={l.label} className="flex items-center gap-3 border-b border-border-subtle px-3.5 py-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-caption text-text-secondary">{l.label}</span>
                    <span className="font-mono text-[16px] leading-[22px] break-all">{l.value}</span>
                  </div>
                  <Button variant="secondary" size="sm" icon={Copy} onClick={() => copy(l.value, t("copied"))}>
                    {t("copy")}
                  </Button>
                </div>
              ))}
              <div className="px-3.5 py-2.5 text-caption text-text-muted">{`${t("crUrl")}: ${loginUrl}`}</div>
            </div>
            <Alert tone="warning" title={t("crWarn")} />
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
