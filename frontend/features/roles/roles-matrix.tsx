"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, ChevronsDownUp, ChevronsUpDown, CircleAlert, Info, Lock, Plus, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment, useMemo, useRef, useState, type MouseEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/selection-controls";
import { ErrorState, Skeleton } from "@/components/ui/system-states";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { ensureCsrf } from "@/features/auth/session";
import { useBranches, useEmployees } from "@/features/employees/api";
import { describeError } from "@/features/setup/form-error";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import {
  DIRECTOR,
  HOME_KINDS,
  MATRIX_GROUPS,
  changed,
  changes,
  copyGrants,
  groupRows,
  isNewRole,
  lockOf,
  toRequest,
  toggle,
  type MatrixPermission,
  type MatrixRole,
  type MatrixState,
} from "./matrix";

type Matrix = components["schemas"]["Matrix"];

const MATRIX_KEY = ["roles", "matrix"] as const;

export function useRoleMatrix() {
  return useQuery({ queryKey: MATRIX_KEY, queryFn: () => unwrap(api.GET("/api/roles/matrix")) });
}

function toState(m: Matrix): MatrixState {
  const roles: MatrixRole[] = m.roles.map((r) => ({
    code: r.code,
    name: r.name,
    description: r.description ?? null,
    scope: r.scope,
    home: r.home,
    active: r.active,
    system: r.system,
    employeeCount: r.employeeCount,
  }));
  return { roles, grants: Object.fromEntries(roles.map((r) => [r.code, [...(m.grants[r.code] ?? [])]])) };
}

const FIRST_COL = 280;
const CELL = 112;

interface Panel {
  mode: "new" | "edit";
  code?: string;
  name: string;
  description: string;
  scope: string;
  home: string;
  from: string;
  tried: boolean;
}

/**
 * Rollar va ruxsatlar matritsasi (prototip WizRoles): ustasining 4-qadami va «Sozlamalar → Rollar» sahifasi.
 * Rol kartalari → panel (nom, tavsif, nusxa, doira, bosh sahifa, xodimlar, standartga qaytarish, nofaol qilish);
 * matritsa — guruhlar, qidiruv, «faqat oʻzgarganlar/maxsus», qulflar, bogʻliqliklar; saqlash — bitta soʻrov.
 */
export function RolesMatrix({ mode, onSaved }: { mode: "wizard" | "page"; onSaved?: () => void }) {
  const matrix = useRoleMatrix();
  if (matrix.error) return <ErrorState onRetry={() => matrix.refetch()} />;
  if (!matrix.data)
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton className="h-[84px] w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  return <MatrixEditor key={matrix.dataUpdatedAt} data={matrix.data} mode={mode} onSaved={onSaved} />;
}

function MatrixEditor({ data, mode, onSaved }: { data: Matrix; mode: "wizard" | "page"; onSaved?: () => void }) {
  const t = useTranslations("roles");
  const ts = useTranslations("setup");
  // Dinamik kalitlar (ruxsat, modul, rol kodi) — mavjudligi `has` bilan tekshiriladi
  const tx = t as unknown as { (key: string, values?: Record<string, string | number>): string; has: (key: string) => boolean };
  const qc = useQueryClient();
  const employees = useEmployees();
  const branches = useBranches();
  const perms: MatrixPermission[] = data.permissions;
  const [base] = useState(() => toState(data));
  const [draft, setDraft] = useState(() => toState(data));
  const [sel, setSel] = useState("BRANCH_MANAGER");
  const [query, setQuery] = useState("");
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [onlySpecial, setOnlySpecial] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [panel, setPanel] = useState<Panel | null>(null);
  const [dialog, setDialog] = useState<{ kind: "rem" | "reset"; code?: string; text: string } | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; text: string; cell: string } | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const tipTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const newSeq = useRef(0);

  const save = useMutation({
    mutationFn: async () => {
      await ensureCsrf();
      return unwrap(api.PUT("/api/roles/matrix", { body: { roles: toRequest(draft) } }));
    },
    onSuccess: (m) => {
      qc.setQueryData(MATRIX_KEY, m);
      void qc.invalidateQueries({ queryKey: ["setup"] });
      setDialog(null);
      toast({ tone: "success", title: t("matrix.saved") });
      onSaved?.();
    },
    onError: () => setDialog(null),
  });
  const saveError = describeError(save.error).message;

  const active = draft.roles.filter((r) => r.active);
  const selected = active.some((r) => r.code === sel) ? sel : (active[0]?.code ?? DIRECTOR);
  const ch = changes(base, draft);
  const byCode = (code: string) => draft.roles.find((r) => r.code === code);
  const roleDesc = (r: MatrixRole) => (r.system && tx.has(`matrix.desc.${r.code}`) ? tx(`matrix.desc.${r.code}`) : r.description || "—");
  const permName = (p: MatrixPermission) => {
    const k = `perm.${p.key.replace(".", "_")}`;
    return tx.has(k) ? tx(k) : p.description;
  };
  const permTip = (p: MatrixPermission) => {
    const own = `matrix.tip.${p.key.replace(".", "_")}`;
    if (tx.has(own)) return tx(own);
    const page = p.page ?? p.module;
    const m = tx.has(`modules.${page}`) ? tx(`modules.${page}`) : page;
    return tx(`matrix.tip.${p.kind}`, { m });
  };
  const empsOf = (code: string) => (employees.data ?? []).filter((e) => e.roleCode === code && e.status !== "BLOCKED");
  const branchName = (id?: number | null) =>
    id == null ? t("matrix.scAll") : ((branches.data ?? []).find((b) => b.id === id)?.name ?? "—");

  function click(role: string, p: MatrixPermission, e: MouseEvent<HTMLButtonElement>) {
    const lock = lockOf(role, p);
    if (lock) {
      const r = e.currentTarget.getBoundingClientRect();
      clearTimeout(tipTimer.current);
      setTip({
        x: r.left + r.width / 2,
        y: r.top - 6,
        text: lock === "dir" ? t("matrix.lockDir") : t("matrix.lockOnly"),
        cell: `${role}|${p.key}`,
      });
      tipTimer.current = setTimeout(() => setTip(null), 1800);
      return;
    }
    const on = !(draft.grants[role] ?? []).includes(p.key);
    const r = toggle(draft.grants[role] ?? [], p.key, on, perms);
    setDraft((d) => ({ ...d, grants: { ...d.grants, [role]: r.keys } }));
    setSel(role);
    if (r.off.length) toast({ tone: "info", title: t("matrix.depOff", { n: r.off.length }) });
    else if (r.viewOn) toast({ tone: "info", title: t("matrix.depOn") });
  }

  function trySave() {
    if (!ch.n) return onSaved?.();
    const ids = Object.keys(ch.rem);
    if (ids.length) {
      const seg = ids
        .map((code) =>
          t("matrix.remSeg", {
            r: byCode(code)?.name ?? code,
            n: ch.rem[code].length,
            list: ch.rem[code]
              .map((k) => permName(perms.find((p) => p.key === k) ?? ({ key: k, description: k } as MatrixPermission)))
              .join(", "),
          }),
        )
        .join(". ");
      return setDialog({ kind: "rem", text: `${seg}. ${t("matrix.remEmp", { e: ch.employees })}` });
    }
    save.mutate();
  }

  function openRole(code: string) {
    const r = byCode(code);
    if (!r) return;
    setSel(code);
    setPanel({
      mode: "edit",
      code,
      name: r.name,
      description: r.system ? roleDesc(r) : (r.description ?? ""),
      scope: r.scope,
      home: r.home,
      from: "",
      tried: false,
    });
  }

  const panelRole = panel?.code ? byCode(panel.code) : undefined;
  const nameTrim = panel?.name.trim() ?? "";
  const nameErr =
    panel?.tried && !panelRole?.system
      ? !nameTrim
        ? t("matrix.eNameReq")
        : draft.roles.some((r) => r.code !== panel.code && r.name.toLowerCase() === nameTrim.toLowerCase())
          ? t("matrix.eNameDup")
          : undefined
      : undefined;

  function savePanel() {
    if (!panel) return;
    const dup = draft.roles.some((r) => r.code !== panel.code && r.name.toLowerCase() === nameTrim.toLowerCase());
    if (panel.mode === "new") {
      if (!nameTrim || dup) return setPanel({ ...panel, tried: true });
      const code = `new:${++newSeq.current}`;
      const role: MatrixRole = {
        code,
        name: nameTrim,
        description: panel.description.trim() || null,
        scope: panel.scope,
        home: panel.home,
        active: true,
        system: false,
        employeeCount: 0,
        copiedFrom: panel.from || null,
      };
      setDraft((d) => ({ roles: [...d.roles, role], grants: { ...d.grants, [code]: copyGrants(panel.from || null, d, perms) } }));
      setPanel(null);
      setSel(code);
      setHighlight(code);
      setTimeout(() => setHighlight(null), 1500);
      toast({ tone: "success", title: t("matrix.roleAdded", { r: nameTrim }) });
      return;
    }
    if (!panelRole) return;
    if (!panelRole.system && (!nameTrim || dup)) return setPanel({ ...panel, tried: true });
    setDraft((d) => ({
      ...d,
      roles: d.roles.map((r) =>
        r.code !== panelRole.code
          ? r
          : r.system
            ? { ...r, scope: panel.scope, home: panel.home }
            : { ...r, name: nameTrim, description: panel.description.trim() || null, scope: panel.scope, home: panel.home },
      ),
    }));
    setPanel(null);
  }

  function askReset() {
    if (!panelRole) return;
    const def = new Set(data.defaults[panelRole.code] ?? []);
    const cur = new Set(draft.grants[panelRole.code] ?? []);
    const n = perms.filter((p) => def.has(p.key) !== cur.has(p.key)).length;
    if (!n) return toast({ tone: "info", title: t("matrix.resetNone") });
    setDialog({ kind: "reset", code: panelRole.code, text: t("matrix.resetText", { n, e: empsOf(panelRole.code).length }) });
  }

  function deactivate() {
    if (!panelRole) return;
    const n = empsOf(panelRole.code).length || panelRole.employeeCount;
    if (n) return toast({ tone: "warning", title: t("matrix.deactBlocked", { n }) });
    setDraft((d) => ({ ...d, roles: d.roles.map((r) => (r.code === panelRole.code ? { ...r, active: false } : r)) }));
    setPanel(null);
    toast({ tone: "success", title: t("matrix.deactDone", { r: panelRole.name }) });
  }

  const rows = useMemo(
    () =>
      groupRows(perms, {
        query,
        onlySpecial,
        onlyChanged,
        name: permName,
        isChanged: (k) => active.some((r) => changed(base, draft, r.code, k)),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- permName/active hosilalari draft va base dan
    [perms, query, onlySpecial, onlyChanged, base, draft],
  );
  const allCollapsed = rows.length > 0 && rows.every((g) => collapsed[g.group]) && !query;
  const cols = `${FIRST_COL}px repeat(${active.length}, minmax(${CELL}px, 1fr))`;
  const selGrants = new Set(draft.grants[selected] ?? []);
  const scopeOpts = [
    { value: "all", label: t("matrix.scAll") },
    { value: "own", label: t("matrix.scOwn") },
  ];
  const homeOpts = HOME_KINDS.map((k) => ({ value: k, label: t(`matrix.home.${k}`) }));
  const homeOfRole = (code: string) => byCode(code)?.home ?? "operator";
  const last = data.lastChange;

  return (
    <div className={cn("flex min-h-0 flex-col", mode === "wizard" && "min-h-[calc(100dvh-64px)]")}>
      <div className={cn("flex flex-1 flex-col gap-[20px] pb-[24px]", mode === "wizard" && "px-[24px] pt-[32px]")}>
        {mode === "wizard" ? (
          <div className="flex flex-col">
            <span className="text-caption font-medium text-primary-button">{ts("stepOf", { n: 4, total: 6 })}</span>
            <h1 className="mt-[6px] text-[26px] leading-[32px] font-semibold tracking-[-0.01em]">{t("matrix.t4")}</h1>
            <p className="mt-[8px] max-w-[720px] text-body text-pretty text-text-secondary">{t("matrix.d4")}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <h1 className="text-page-title">{t("title")}</h1>
            <p className="text-body text-text-secondary">{t("matrix.d4")}</p>
            <span className="text-table text-text-secondary">
              {last ? t("matrix.lastChange", { at: formatDateTime(new Date(last.at)), by: last.by ?? "—" }) : t("matrix.defaultVal")}
            </span>
          </div>
        )}

        {saveError ? (
          <Alert tone="danger" title={t("matrix.saveErr")}>
            {saveError}
          </Alert>
        ) : null}

        <div className="flex gap-[12px] overflow-x-auto pb-1">
          {draft.roles.map((r) => {
            const on = r.code === selected;
            return (
              <button
                key={r.code}
                type="button"
                onClick={() => openRole(r.code)}
                className={cn(
                  "flex h-[84px] w-[228px] flex-none flex-col gap-0.5 rounded-modal border px-[14px] py-[12px] text-left transition-colors duration-150 ease-out hover:border-primary-button",
                  on ? "border-primary bg-primary-soft" : "border-border bg-surface",
                  highlight === r.code && "bg-primary-soft",
                  !r.active && "opacity-60",
                )}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-body font-semibold">{r.name}</span>
                  {r.system ? <Badge>{t("matrix.std")}</Badge> : null}
                  {!r.active ? <Badge>{t("matrix.inactive")}</Badge> : null}
                </span>
                <span className="truncate text-caption text-text-secondary">{roleDesc(r)}</span>
                <span className="mt-auto text-caption text-text-secondary">
                  {t("matrix.cardMeta", {
                    p: r.code === DIRECTOR ? perms.filter((p) => p.lock !== "excl").length : (draft.grants[r.code] ?? []).length,
                    e: r.employeeCount,
                  })}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() =>
              setPanel({
                mode: "new",
                name: "",
                description: "",
                scope: "own",
                from: "OPERATOR",
                home: homeOfRole("OPERATOR"),
                tried: false,
              })
            }
            className="flex h-[84px] w-[180px] flex-none items-center justify-center gap-1.5 rounded-modal border border-dashed border-border text-body font-medium text-primary-button hover:bg-background"
          >
            <Plus size={16} strokeWidth={1.5} aria-hidden />
            {t("matrix.addRole")}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="w-[320px] max-w-full">
            <TextField
              label={t("matrix.search")}
              variant="search"
              size="sm"
              value={query}
              onChange={setQuery}
              placeholder={t("matrix.search")}
              className="[&>label]:sr-only"
            />
          </div>
          <div className="flex-1" />
          <Switch label={t("matrix.onlyChanged")} checked={onlyChanged} onChange={setOnlyChanged} />
          <Switch label={t("matrix.onlySpecial")} checked={onlySpecial} onChange={setOnlySpecial} />
          <Button
            variant="secondary"
            size="sm"
            icon={allCollapsed ? ChevronsUpDown : ChevronsDownUp}
            onClick={() => setCollapsed(allCollapsed ? {} : Object.fromEntries(MATRIX_GROUPS.map((g) => [g, true])))}
          >
            {allCollapsed ? t("matrix.expandAll") : t("matrix.collapseAll")}
          </Button>
        </div>

        <div
          className="h-[min(560px,max(320px,calc(100dvh-360px)))] overflow-auto rounded-modal border border-border bg-surface"
          data-testid="roles-matrix"
        >
          <div style={{ minWidth: FIRST_COL + active.length * CELL }}>
            <div className="sticky top-0 z-[3] grid border-b border-border bg-surface" style={{ gridTemplateColumns: cols }}>
              <div className="sticky left-0 z-[4] flex items-end border-r border-border bg-surface px-4 py-2.5 text-caption font-medium text-text-secondary">
                {t("matrix.colAction")}
              </div>
              {active.map((r) => (
                <button
                  key={r.code}
                  type="button"
                  onClick={() => setSel(r.code)}
                  className={cn(
                    "flex flex-col items-center justify-end gap-0.5 px-2 py-2.5 text-center transition-colors duration-150",
                    highlight === r.code ? "bg-primary-soft" : r.code === selected ? "bg-background" : "bg-surface",
                  )}
                >
                  <span className="max-w-full truncate text-table font-semibold">{r.name}</span>
                  <span className="text-caption text-text-secondary">{t("matrix.empN", { n: r.employeeCount })}</span>
                  {r.code !== DIRECTOR && !(draft.grants[r.code] ?? []).length ? (
                    <span className="text-caption text-warning">{t("matrix.noPerm")}</span>
                  ) : null}
                </button>
              ))}
            </div>
            {rows.map((g) => {
              const isColl = !!collapsed[g.group] && !query;
              return (
                <Fragment key={g.group}>
                  <div className="grid h-10 border-b border-border bg-background" style={{ gridTemplateColumns: cols }}>
                    <button
                      type="button"
                      aria-expanded={!isColl}
                      onClick={() => setCollapsed((c) => ({ ...c, [g.group]: !c[g.group] }))}
                      className="sticky left-0 z-[2] flex items-center gap-1.5 border-r border-border bg-background pr-4 pl-2.5 text-left"
                    >
                      <ChevronDown
                        size={14}
                        strokeWidth={1.5}
                        aria-hidden
                        className={cn("flex-none text-text-secondary transition-transform", isColl && "-rotate-90")}
                      />
                      <span className="flex-1 truncate text-table font-semibold">{t(`matrix.groups.${g.group}`)}</span>
                      <span className="text-caption text-text-secondary">
                        {selected === DIRECTOR
                          ? g.all.filter((p) => p.lock !== "excl").length
                          : g.all.filter((p) => selGrants.has(p.key)).length}{" "}
                        / {g.all.length}
                      </span>
                    </button>
                    {active.map((r) => (
                      <span key={r.code} className={r.code === selected ? "bg-border/40" : undefined} />
                    ))}
                  </div>
                  {isColl
                    ? null
                    : g.items.map((p) => (
                        <div key={p.key} className="grid h-11 border-b border-border bg-surface" style={{ gridTemplateColumns: cols }}>
                          <div className="sticky left-0 z-[2] flex min-w-0 items-center gap-1.5 border-r border-border bg-surface pr-3 pl-[34px]">
                            <span title={permName(p)} className="min-w-0 flex-1 truncate text-table">
                              {permName(p)}
                            </span>
                            <Tooltip content={permTip(p)} placement="right">
                              <span tabIndex={0} aria-label={permTip(p)} className="flex flex-none cursor-help text-text-secondary">
                                <Info size={14} strokeWidth={1.5} aria-hidden />
                              </span>
                            </Tooltip>
                          </div>
                          {active.map((r) => {
                            const lock = lockOf(r.code, p);
                            const on =
                              r.code === DIRECTOR
                                ? (data.grants[DIRECTOR] ?? []).includes(p.key)
                                : (draft.grants[r.code] ?? []).includes(p.key);
                            const isChanged = !lock && changed(base, draft, r.code, p.key);
                            const shaking = tip?.cell === `${r.code}|${p.key}`;
                            return (
                              <button
                                key={r.code}
                                type="button"
                                data-cell={`${r.code}|${p.key}`}
                                aria-label={`${permName(p)} · ${r.name}`}
                                aria-pressed={on}
                                aria-disabled={lock ? true : undefined}
                                onClick={(e) => click(r.code, p, e)}
                                className={cn(
                                  "relative flex items-center justify-center",
                                  lock ? "cursor-not-allowed" : "cursor-pointer",
                                  isChanged || highlight === r.code
                                    ? "bg-primary-soft"
                                    : r.code === selected
                                      ? "bg-background"
                                      : "bg-surface",
                                )}
                              >
                                {lock ? (
                                  <Lock
                                    size={14}
                                    strokeWidth={1.5}
                                    aria-hidden
                                    className={cn("text-text-secondary", shaking && "animate-shake")}
                                  />
                                ) : (
                                  <span
                                    className={cn(
                                      "flex size-4 items-center justify-center rounded-[4px] border",
                                      on ? "border-primary-button bg-primary-button text-white" : "border-text-disabled bg-surface",
                                    )}
                                  >
                                    {on ? <Check size={12} strokeWidth={3} aria-hidden /> : null}
                                  </span>
                                )}
                                {isChanged ? (
                                  <span aria-hidden className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-primary" />
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                      ))}
                </Fragment>
              );
            })}
            {!rows.length ? <div className="px-4 py-8 text-center text-table text-text-secondary">{t("matrix.noRows")}</div> : null}
          </div>
        </div>
      </div>

      <div className="sticky bottom-0 z-10 flex h-16 flex-none items-center justify-between gap-3 border-t border-border bg-surface px-6">
        <span className="flex min-w-0 items-center gap-2 text-table text-text-secondary" aria-live="polite">
          {ch.n ? (
            <>
              <span aria-hidden className="size-2 flex-none rounded-full bg-warning" />
              <span className="truncate">
                {t("matrix.changes", { n: ch.n })}
                {ch.roles.length ? t("matrix.impact", { r: ch.roles.length, e: ch.employees }) : ""}
              </span>
            </>
          ) : null}
        </span>
        <div className="flex flex-none gap-2">
          <Button variant="secondary" size="sm" onClick={() => setDraft(base)} disabled={!ch.n}>
            {t("matrix.cancel")}
          </Button>
          <Button size="sm" icon={Check} loading={save.isPending} onClick={trySave}>
            {mode === "wizard" ? t("matrix.saveNext") : t("matrix.save")}
          </Button>
        </div>
      </div>

      <Drawer
        open={!!panel}
        onClose={() => setPanel(null)}
        title={panel?.mode === "new" ? t("matrix.pTitleNew") : (panelRole?.name ?? "")}
        actions={
          <div className="flex w-full items-center justify-between gap-2">
            <div className="flex">
              {panelRole?.system && panelRole.code !== DIRECTOR ? (
                <Button variant="secondary" size="sm" icon={RotateCcw} onClick={askReset}>
                  {t("matrix.pReset")}
                </Button>
              ) : null}
              {panelRole && !panelRole.system && panelRole.active ? (
                <Button variant="secondary" size="sm" className="text-danger" onClick={deactivate}>
                  {t("matrix.pDeact")}
                </Button>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setPanel(null)}>
                {t("matrix.cancel")}
              </Button>
              <Button size="sm" onClick={savePanel}>
                {t("matrix.pSave")}
              </Button>
            </div>
          </div>
        }
      >
        {panel ? (
          <div className="flex flex-col gap-4">
            <TextField
              label={t("matrix.pName")}
              required
              value={panel.name}
              onChange={(v) => setPanel({ ...panel, name: v })}
              readOnly={!!panelRole?.system}
              error={nameErr}
            />
            <TextField
              label={t("matrix.pDesc")}
              value={panel.description}
              onChange={(v) => setPanel({ ...panel, description: v })}
              readOnly={!!panelRole?.system}
            />
            {panel.mode === "new" ? (
              <Select
                label={t("matrix.pFrom")}
                options={[{ value: "", label: t("matrix.fromNone") }, ...active.map((r) => ({ value: r.code, label: r.name }))]}
                value={panel.from}
                onChange={(v) => setPanel({ ...panel, from: v ?? "", home: v ? homeOfRole(v) : panel.home })}
              />
            ) : null}
            <Select
              label={t("matrix.pScope")}
              options={scopeOpts}
              value={panel.scope}
              onChange={(v) => setPanel({ ...panel, scope: v ?? "own" })}
              disabled={panelRole?.code === DIRECTOR}
            />
            <Select
              label={t("matrix.pHome")}
              options={homeOpts}
              value={panel.home}
              onChange={(v) => setPanel({ ...panel, home: v ?? "operator" })}
              disabled={panelRole?.code === DIRECTOR}
            />
            {panelRole && !isNewRole(panelRole.code) ? (
              <div className="flex flex-col gap-2">
                <span className="text-table font-medium">{t("matrix.pEmps")}</span>
                {empsOf(panelRole.code).length ? (
                  empsOf(panelRole.code).map((e) => (
                    <div key={e.id} className="flex h-9 items-center gap-2.5">
                      <span className="flex size-7 flex-none items-center justify-center rounded-full bg-primary-soft text-[11px] font-semibold text-primary-button">
                        {e.fullName
                          .split(/\s+/)
                          .slice(0, 2)
                          .map((x) => x[0] ?? "")
                          .join("")}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-table">{e.fullName}</span>
                      <span className="text-caption text-text-secondary">{branchName(e.branchId)}</span>
                    </div>
                  ))
                ) : (
                  <span className="text-table text-text-secondary">{t("matrix.pNoEmps")}</span>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </Drawer>

      <Modal
        open={!!dialog}
        size="sm"
        tone={dialog?.kind === "rem" ? "danger" : "default"}
        onClose={() => setDialog(null)}
        title={dialog?.kind === "rem" ? t("matrix.remT") : t("matrix.resetT")}
        primaryAction={{
          label: dialog?.kind === "rem" ? t("matrix.remOk") : t("matrix.pReset"),
          loading: save.isPending,
          onClick: () => {
            if (dialog?.kind === "rem") return save.mutate();
            const code = dialog?.code;
            if (code) setDraft((d) => ({ ...d, grants: { ...d.grants, [code]: [...(data.defaults[code] ?? [])] } }));
            setDialog(null);
          },
        }}
        secondaryAction={{ label: t("matrix.cancel"), onClick: () => setDialog(null) }}
      >
        <p className="text-text-secondary">{dialog?.text}</p>
      </Modal>

      {tip ? (
        <div
          role="tooltip"
          className="pointer-events-none fixed z-[190] max-w-[260px] -translate-x-1/2 -translate-y-full rounded-control bg-text-primary px-2.5 py-1.5 text-caption text-white shadow-lg"
          style={{ left: tip.x, top: tip.y }}
        >
          <span className="inline-flex items-center gap-1.5">
            <CircleAlert size={12} strokeWidth={1.5} aria-hidden />
            {tip.text}
          </span>
        </div>
      ) : null}
    </div>
  );
}
