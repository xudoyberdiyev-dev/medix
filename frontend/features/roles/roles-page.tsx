"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Checkbox } from "@/components/ui/selection-controls";
import { ErrorState, ForbiddenState, Skeleton } from "@/components/ui/system-states";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { can } from "@/features/auth/can";
import { ensureCsrf, useMe } from "@/features/auth/session";
import { describeError } from "@/features/setup/form-error";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { cn } from "@/lib/cn";
import { matchesSearch } from "@/lib/search";

type Matrix = components["schemas"]["Matrix"];

/** Tartib va asl (uz-Latn) nomlar; UI — `roles.modules.<modul>` lugʻatidan. */
const MODULE_TITLES = {
  orders: "Buyurtmalar",
  approvals: "Tasdiqlar",
  shipments: "Joʻnatish",
  trip: "Reys",
  picking: "Yigʻish",
  marking: "Markirovka",
  receipt: "Kirim",
  stock: "Qoldiqlar",
  expiry: "Muddat nazorati",
  transfer: "Koʻchirishlar",
  inventory: "Inventarizatsiya",
  hc: "Hisobdan chiqarish",
  qm: "Mijozdan qaytarish",
  qy: "YB ga qaytarish",
  opening: "Boshlangʻich qoldiq",
  payments: "Toʻlovlar",
  cash: "Kassa",
  bank: "Bank",
  adv: "Avans",
  cdebt: "Mijozlar qarzi",
  sdebt: "YB qarzi",
  recon: "Akt sverka",
  supplierBonus: "YB bonusi",
  supplierPay: "YB toʻlovi",
  products: "Mahsulotlar",
  clients: "Mijozlar",
  suppliers: "Yetkazib beruvchilar",
  prices: "Narxlar",
  lookups: "Maʼlumotnomalar",
  reports: "Hisobotlar",
  company: "Kompaniya",
  branches: "Filiallar",
  warehouses: "Omborlar",
  staff: "Xodimlar",
  roles: "Rollar",
  audit: "Audit",
  settings: "Sozlamalar",
  special: "Maxsus",
} as const satisfies Record<string, string>;

type ModuleKey = keyof typeof MODULE_TITLES;
const isModule = (m: string): m is ModuleKey => Object.hasOwn(MODULE_TITLES, m);

/** Modullar boʻyicha guruhlash (MODULE_TITLES tartibida, notanishlar oxirida). */
export function groupPermissions<T extends { key: string; module: string }>(perms: T[]): { module: string; title: string; items: T[] }[] {
  const order = Object.keys(MODULE_TITLES);
  const groups = new Map<string, T[]>();
  for (const p of perms) groups.set(p.module, [...(groups.get(p.module) ?? []), p]);
  return [...groups.entries()]
    .sort(([a], [b]) => (order.indexOf(a) === -1 ? 999 : order.indexOf(a)) - (order.indexOf(b) === -1 ? 999 : order.indexOf(b)))
    .map(([module, items]) => ({ module, title: isModule(module) ? MODULE_TITLES[module] : module, items }));
}

function useMatrix() {
  return useQuery({ queryKey: ["roles", "matrix"], queryFn: () => unwrap(api.GET("/api/roles/matrix")) });
}

export function RolesPage() {
  const t = useTranslations("roles");
  const me = useMe();
  const matrix = useMatrix();
  const [role, setRole] = useState<string>("ADMIN");
  if (me.data && !can(me.data, "roles.view")) return <ForbiddenState description={t("forbidden")} />;
  if (matrix.error) return <ErrorState onRetry={() => matrix.refetch()} />;
  if (!matrix.data)
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  return (
    <>
      <h1 className="mb-4 text-page-title">{t("title")}</h1>
      <div className="grid grid-cols-[260px_1fr] gap-4">
        <Card flush>
          <ul className="py-2" role="listbox" aria-label={t("roles")}>
            {matrix.data.roles.map((r) => (
              <li key={r.code}>
                <button
                  type="button"
                  role="option"
                  aria-selected={r.code === role}
                  onClick={() => setRole(r.code)}
                  className={cn(
                    "flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-background",
                    r.code === role && "bg-primary-soft font-medium text-primary",
                  )}
                >
                  <span className="flex-1">{r.name}</span>
                  <span className="text-caption text-text-secondary">{matrix.data.grants[r.code]?.length ?? 0}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
        <RoleEditor key={role} matrix={matrix.data} roleCode={role} onCopied={setRole} />
      </div>
    </>
  );
}

function RoleEditor({ matrix, roleCode, onCopied }: { matrix: Matrix; roleCode: string; onCopied: (code: string) => void }) {
  const t = useTranslations("roles");
  const moduleTitle = (m: string) => (isModule(m) ? t(`modules.${m}`) : m);
  const qc = useQueryClient();
  const role = matrix.roles.find((r) => r.code === roleCode);
  const initial = useMemo(() => new Set(matrix.grants[roleCode] ?? []), [matrix, roleCode]);
  const [selected, setSelected] = useState<Set<string>>(initial);
  const [query, setQuery] = useState("");
  const [copying, setCopying] = useState(false);
  const locked = roleCode === "DIRECTOR";
  const save = useMutation({
    mutationFn: async () => {
      await ensureCsrf();
      return unwrap(
        api.PUT("/api/roles/{code}/permissions", { params: { path: { code: roleCode } }, body: { permissions: [...selected] } }),
      );
    },
    onSuccess: (m) => {
      qc.setQueryData(["roles", "matrix"], m);
      toast({ tone: "success", title: t("saved"), description: t("savedDescription", { role: role?.name ?? "" }) });
    },
  });
  const err = describeError(save.error);
  const changed = selected.size !== initial.size || [...selected].some((k) => !initial.has(k));
  const groups = groupPermissions(matrix.permissions.filter((p) => matchesSearch(query, [p.key, p.description, moduleTitle(p.module)])));
  const toggle = (key: string, on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      if (on) n.add(key);
      else n.delete(key);
      return n;
    });

  if (!role) return null;
  return (
    <Card
      title={role.name}
      actions={
        <div className="flex items-center gap-2">
          {role.system ? (
            <Badge tone="neutral" icon={ShieldCheck}>
              {t("standard")}
            </Badge>
          ) : null}
          <Button variant="secondary" size="sm" icon={Copy} onClick={() => setCopying(true)}>
            {t("copy")}
          </Button>
          {!locked ? (
            <Button size="sm" disabled={!changed} loading={save.isPending} onClick={() => save.mutate()}>
              {t("save")}
            </Button>
          ) : null}
        </div>
      }
    >
      {locked ? (
        <Alert tone="info" title={t("lockedTitle")} className="mb-4">
          {t("lockedDescription")}
        </Alert>
      ) : (
        <p className="mb-4 text-text-secondary">{t("summary", { selected: selected.size, employees: role.employeeCount })}</p>
      )}
      {err.message ? <Alert tone="danger" title={err.message} className="mb-4" /> : null}
      <div className="mb-4 w-80">
        <TextField
          label={t("search")}
          variant="search"
          size="sm"
          value={query}
          onChange={setQuery}
          placeholder={t("searchPlaceholder")}
          className="[&>label]:sr-only"
        />
      </div>
      <div className="flex flex-col gap-5">
        {groups.map((g) => (
          <section key={g.module}>
            <h3 className="mb-2 flex items-center gap-2 text-label text-text-secondary">
              {moduleTitle(g.module)}
              <span className="text-caption">
                {g.items.filter((p) => selected.has(p.key)).length}/{g.items.length}
              </span>
            </h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              {g.items.map((p) => (
                <div key={p.key} className="flex items-start gap-2">
                  <Checkbox
                    label={p.description.replace(/^[^:]+:\s*/, "")}
                    description={p.key}
                    checked={selected.has(p.key)}
                    disabled={locked}
                    onChange={(on) => toggle(p.key, on)}
                  />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
      {copying ? <CopyDialog source={role.code} sourceName={role.name} onClose={() => setCopying(false)} onCopied={onCopied} /> : null}
    </Card>
  );
}

function CopyDialog({
  source,
  sourceName,
  onClose,
  onCopied,
}: {
  source: string;
  sourceName: string;
  onClose: () => void;
  onCopied: (code: string) => void;
}) {
  const t = useTranslations("roles.copyDialog");
  const qc = useQueryClient();
  const [name, setName] = useState(() => t("defaultName", { name: sourceName }));
  const copy = useMutation({
    mutationFn: async () => {
      await ensureCsrf();
      return unwrap(api.POST("/api/roles/{code}/copy", { params: { path: { code: source } }, body: { name } }));
    },
    onSuccess: async (r) => {
      await qc.invalidateQueries({ queryKey: ["roles"] });
      toast({ tone: "success", title: t("done"), description: r.name });
      onCopied(r.code);
      onClose();
    },
  });
  const err = describeError(copy.error);
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={t("title")}
      primaryAction={{ label: t("create"), loading: copy.isPending, onClick: () => copy.mutate() }}
    >
      <p className="mb-4 text-text-secondary">{t("description", { name: sourceName })}</p>
      <TextField label={t("name")} value={name} onChange={setName} error={err.fields.name} required autoFocus />
      {err.message ? <Alert tone="danger" title={err.message} className="mt-4" /> : null}
    </Modal>
  );
}
