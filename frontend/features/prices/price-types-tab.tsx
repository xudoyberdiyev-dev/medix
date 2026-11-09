"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheck, CirclePause, CirclePlay, History, Pencil, Tag } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HistoryTimeline } from "@/components/ui/history-timeline";
import { Icon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/modal";
import { RowMenu } from "@/components/ui/row-menu";
import { Table, type SortState, type TableColumn } from "@/components/ui/table";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { ensureCsrf } from "@/features/auth/session";
import { describeError } from "@/features/setup/form-error";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { cn } from "@/lib/cn";
import { formatDate, formatQuantity } from "@/lib/format";

type PriceType = components["schemas"]["PriceTypeOverview"];

const COLLATOR = new Intl.Collator("uz");

export function sortTypes(rows: PriceType[], sort: SortState): PriceType[] {
  const val = (t: PriceType): number | string => {
    switch (sort.key) {
      case "prods":
        return t.priced;
      case "custs":
        return t.customers;
      case "last":
        return t.lastChange ?? "";
      case "batch":
        return Number(t.batch);
      case "base":
        return Number(t.base);
      case "status":
        return Number(!t.active);
      case "alt":
        return (t.altName ?? "").toLowerCase();
      default:
        return t.name.toLowerCase();
    }
  };
  const dir = sort.dir === "asc" ? 1 : -1;
  return rows.slice().sort((a, b) => {
    const x = val(a);
    const y = val(b);
    const c = typeof x === "number" && typeof y === "number" ? x - y : COLLATOR.compare(String(x), String(y));
    return c * dir;
  });
}

/** Narxlar → «Narx turlari» (prototip `Prices`, `isTypes`): jadval, tanlangan tur uchun amallar paneli. */
export function PriceTypesTab({
  branchId,
  canSet,
  canEdit,
  onSetPrices,
}: {
  branchId: number | null;
  canSet: boolean;
  canEdit: boolean;
  onSetPrices: (priceTypeId: number) => void;
}) {
  const t = useTranslations("prices.types");
  const qc = useQueryClient();
  const [sort, setSort] = useState<SortState>({ key: "name", dir: "asc" });
  const [selId, setSelId] = useState<number | null>(null);
  const [edit, setEdit] = useState<PriceType | null>(null);
  const [hist, setHist] = useState<PriceType | null>(null);
  const [deact, setDeact] = useState<PriceType | null>(null);
  const list = useQuery({
    queryKey: ["price-types", "overview", branchId],
    queryFn: () => unwrap(api.GET("/api/price-types/overview", { params: { query: { branchId: branchId ?? 0 } } })),
    enabled: branchId != null,
  });
  const rows = sortTypes(list.data ?? [], sort);
  const sel = rows.find((r) => r.id === selId) ?? null;

  const save = useMutation({
    mutationFn: async (v: { id: number; name: string; altName: string | null; active: boolean }) => {
      await ensureCsrf();
      return unwrap(
        api.PUT("/api/price-types/{id}", {
          params: { path: { id: v.id }, query: { branchId: branchId ?? 0 } },
          body: { name: v.name, altName: v.altName ?? undefined, active: v.active },
        }),
      );
    },
    onSuccess: async (r, v) => {
      await qc.invalidateQueries({ queryKey: ["price-types"] });
      toast({
        tone: "success",
        title:
          v.active === r.active && edit
            ? t("saved", { n: r.name })
            : r.active
              ? t("activated", { n: r.name })
              : t("deactivated", { n: r.name }),
      });
      setEdit(null);
      setDeact(null);
    },
  });

  const yn = (on: boolean, strong: boolean) => (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-control px-2 text-caption font-medium",
        on ? (strong ? "bg-primary-soft text-primary" : "bg-info-bg text-info") : "bg-background text-text-secondary",
      )}
    >
      {on ? t("yes") : t("no")}
    </span>
  );

  const columns: TableColumn<PriceType>[] = [
    { key: "name", title: t("cName"), sortable: true, wrap: true, render: (r) => <span className="font-semibold">{r.name}</span> },
    { key: "alt", title: t("cAlt"), sortable: true, render: (r) => <span className="text-text-secondary">{r.altName || "—"}</span> },
    { key: "cur", title: t("cCur"), width: 84, render: () => <span className="text-text-secondary">{t("som")}</span> },
    { key: "kind", title: t("cKind"), width: 112, render: () => <span className="text-text-secondary">{t("kindSale")}</span> },
    { key: "batch", title: t("cBatch"), width: 128, sortable: true, render: (r) => yn(r.batch, false) },
    { key: "base", title: t("cBase"), width: 92, sortable: true, render: (r) => yn(r.base, true) },
    {
      key: "prods",
      title: t("cProds"),
      width: 120,
      align: "right",
      sortable: true,
      render: (r) => (
        <span className={cn("font-medium", r.priced < r.total && "text-warning")}>
          {formatQuantity(r.priced)} / {formatQuantity(r.total)}
        </span>
      ),
    },
    { key: "custs", title: t("cCusts"), width: 160, align: "right", sortable: true, render: (r) => formatQuantity(r.customers) },
    {
      key: "last",
      title: t("cLast"),
      width: 130,
      sortable: true,
      render: (r) => <span className="text-text-secondary">{r.lastChange ? formatDate(new Date(`${r.lastChange}T00:00:00`)) : "—"}</span>,
    },
    {
      key: "status",
      title: t("cStatus"),
      width: 110,
      sortable: true,
      render: (r) => (
        <Badge tone={r.active ? "success" : "neutral"} icon={r.active ? CircleCheck : CirclePause}>
          {r.active ? t("active") : t("inactive")}
        </Badge>
      ),
    },
  ];

  const actions = (r: PriceType) =>
    [
      canSet && r.active ? { key: "set", label: t("aSet"), icon: <Icon icon={Tag} />, onSelect: () => onSetPrices(r.id) } : null,
      canEdit ? { key: "edit", label: t("aEdit"), icon: <Icon icon={Pencil} />, onSelect: () => (setSelId(r.id), setEdit(r)) } : null,
      { key: "hist", label: t("aHist"), icon: <Icon icon={History} />, onSelect: () => (setSelId(r.id), setHist(r)) },
    ].filter((x) => x !== null);

  return (
    <div className="flex flex-col gap-3">
      <Table
        caption={t("caption")}
        columns={columns}
        rows={rows}
        rowKey={(r) => String(r.id)}
        sort={sort}
        onSortChange={setSort}
        onRowClick={(r) => setSelId(r.id)}
        activeKey={sel ? String(sel.id) : undefined}
        rowActions={(r) => <RowMenu items={actions(r)} />}
        loading={list.isPending && branchId != null}
      />
      <div className="sticky bottom-0 flex min-h-14 flex-wrap items-center gap-2 rounded-card border border-border bg-surface px-4 py-2.5">
        {sel ? (
          <>
            <span className="mr-2 font-semibold">{sel.name}</span>
            {canSet ? (
              <Button variant="secondary" icon={Tag} disabled={!sel.active} onClick={() => onSetPrices(sel.id)}>
                {t("aSet")}
              </Button>
            ) : null}
            {canEdit ? (
              <Button variant="secondary" icon={Pencil} onClick={() => setEdit(sel)}>
                {t("aEdit")}
              </Button>
            ) : null}
            <Button variant="secondary" icon={History} onClick={() => setHist(sel)}>
              {t("aHist")}
            </Button>
            {canEdit ? (
              sel.active ? (
                <Button variant="secondary" icon={CirclePause} className="text-danger" onClick={() => setDeact(sel)}>
                  {t("aDeact")}
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  icon={CirclePlay}
                  loading={save.isPending}
                  onClick={() => save.mutate({ id: sel.id, name: sel.name, altName: sel.altName ?? null, active: true })}
                >
                  {t("aAct")}
                </Button>
              )
            ) : null}
          </>
        ) : (
          <span className="text-text-secondary">{t("selHint")}</span>
        )}
      </div>

      {edit ? (
        <EditDialog
          key={edit.id}
          type={edit}
          pending={save.isPending}
          error={save.error}
          onClose={() => (setEdit(null), save.reset())}
          onSave={(v) => save.mutate({ id: edit.id, ...v })}
        />
      ) : null}
      {hist ? <HistoryDialog type={hist} onClose={() => setHist(null)} /> : null}
      {deact ? (
        <Modal
          open
          tone="danger"
          title={t("deactT", { n: deact.name })}
          onClose={() => (setDeact(null), save.reset())}
          primaryAction={{
            label: t("aDeact"),
            loading: save.isPending,
            onClick: () => save.mutate({ id: deact.id, name: deact.name, altName: deact.altName ?? null, active: false }),
          }}
        >
          <div className="flex flex-col gap-3">
            <p>{t("deactD")}</p>
            {save.error ? <p className="text-danger">{describeError(save.error).message}</p> : null}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function EditDialog({
  type,
  pending,
  error,
  onClose,
  onSave,
}: {
  type: PriceType;
  pending: boolean;
  error: unknown;
  onClose: () => void;
  onSave: (v: { name: string; altName: string | null; active: boolean }) => void;
}) {
  const t = useTranslations("prices.types");
  const [name, setName] = useState(type.name);
  const [alt, setAlt] = useState(type.altName ?? "");
  const [err, setErr] = useState("");
  const serverErr = describeError(error).message;
  return (
    <Modal
      open
      title={t("editT", { n: type.name })}
      onClose={onClose}
      primaryAction={{
        label: t("save"),
        loading: pending,
        onClick: () => {
          if (!name.trim()) return setErr(t("eName"));
          onSave({ name: name.trim(), altName: alt.trim() || null, active: type.active });
        },
      }}
    >
      <div className="flex flex-col gap-4">
        <TextField label={t("fName")} required value={name} onChange={(v) => (setName(v), setErr(""))} error={err || undefined} />
        <TextField label={t("fAlt")} value={alt} onChange={setAlt} hint={t("fAltHint")} />
        <div className="flex flex-col gap-1 text-caption text-text-secondary">
          <span>
            {t("cBatch")}: {type.batch ? t("yes") : t("no")} · {t("cBase")}: {type.base ? t("yes") : t("no")}
          </span>
          <span>{t("fixedHint")}</span>
        </div>
        {serverErr ? <p className="text-danger">{serverErr}</p> : null}
      </div>
    </Modal>
  );
}

function HistoryDialog({ type, onClose }: { type: PriceType; onClose: () => void }) {
  const t = useTranslations("prices.types");
  const q = useQuery({
    queryKey: ["price-types", "history", type.id],
    queryFn: () => unwrap(api.GET("/api/price-types/{id}/history", { params: { path: { id: type.id } } })),
  });
  const data = q.data?.map((h) => ({
    at: h.at,
    employee: h.employee ?? undefined,
    action: h.action,
    reason: describeChange(h.oldValue, h.newValue),
  }));
  return (
    <Modal open title={t("histT", { n: type.name })} onClose={onClose} primaryAction={{ label: t("close"), onClick: onClose }}>
      <HistoryTimeline query={{ data, error: q.error, refetch: q.refetch }} label={(a) => (a === "priceType.update" ? t("hUpdate") : a)} />
    </Modal>
  );
}

/** «nom: Promo → Promo narx» — audit qiymatlari (JSON) farqi. */
export function describeChange(oldV?: string | null, newV?: string | null): string | undefined {
  try {
    const a = (oldV ? JSON.parse(oldV) : {}) as Record<string, unknown>;
    const b = (newV ? JSON.parse(newV) : {}) as Record<string, unknown>;
    const keys = Object.keys(b).filter((k) => JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null));
    if (!keys.length) return undefined;
    return keys.map((k) => `${k}: ${String(a[k] ?? "—")} → ${String(b[k] ?? "—")}`).join("; ");
  } catch {
    return undefined;
  }
}
