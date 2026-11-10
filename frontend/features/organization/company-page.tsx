"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { ErrorState, ForbiddenState, Skeleton } from "@/components/ui/system-states";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { can, canAny } from "@/features/auth/can";
import { ensureCsrf, useMe } from "@/features/auth/session";
import { describeError } from "@/features/setup/form-error";
import { api, unwrap } from "@/lib/api/client";
import { formatDateTime, formatQuantity } from "@/lib/format";

/** Prototip AdminOrg «Kompaniya»: guruh maʼlumotlari va tizim holati; nom — company.edit bilan tahrirlanadi (audit). */
export function CompanyPage() {
  const t = useTranslations("company");
  const me = useMe();
  const qc = useQueryClient();
  const allowed = canAny(me.data, ["company.view", "company.edit"]);
  const canEdit = can(me.data, "company.edit");
  const co = useQuery({ queryKey: ["company"], queryFn: () => unwrap(api.GET("/api/company")), enabled: allowed });
  const [editing, setEditing] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const save = useMutation({
    mutationFn: async (name: string) => {
      await ensureCsrf();
      return unwrap(api.PUT("/api/company", { body: { name } }));
    },
    onSuccess: async (d) => {
      qc.setQueryData(["company"], d);
      await qc.invalidateQueries({ queryKey: ["nav-badges"] });
      setEditing(null);
      toast({ tone: "success", title: t("saved") });
    },
    onError: (e) => toast({ tone: "danger", title: t("saveFailed"), description: describeError(e).message ?? undefined }),
  });

  if (me.data && !allowed) return <ForbiddenState description={t("forbidden")} />;
  const d = co.data;
  const rows: [string, string][] = d
    ? [
        [t("name"), d.name],
        [t("branches"), formatQuantity(d.branches)],
        [t("warehouses"), formatQuantity(d.warehouses)],
        [t("staff"), formatQuantity(d.employees)],
        [t("launched"), d.launchedAt ? `${formatDateTime(new Date(d.launchedAt))}${d.launchedBy ? ` · ${d.launchedBy}` : ""}` : "—"],
      ]
    : [];
  const empty = editing !== null && editing.trim() === "";

  return (
    <>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-page-title">{t("title")}</h1>
          <p className="text-body text-text-secondary">{t("subtitle")}</p>
        </div>
        {canEdit && d ? (
          <Button icon={Pencil} onClick={() => (setEditing(d.name), setTried(false))}>
            {t("edit")}
          </Button>
        ) : null}
      </div>
      <div className="max-w-[720px]">
        {co.error ? (
          <ErrorState onRetry={() => co.refetch()} />
        ) : (
          <Card title={t("card")}>
            {d ? (
              <dl className="grid grid-cols-[minmax(160px,220px)_1fr] gap-x-6 gap-y-3 text-body">
                {rows.map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-text-secondary">{k}</dt>
                    <dd className="font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <Skeleton className="h-40 w-full" />
            )}
          </Card>
        )}
      </div>
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={t("editTitle")}
        primaryAction={{
          label: t("save"),
          loading: save.isPending,
          onClick: () => {
            setTried(true);
            if (editing && editing.trim() !== "") save.mutate(editing.trim());
          },
        }}
        secondaryAction={{ label: t("cancel"), onClick: () => setEditing(null) }}
      >
        <TextField
          label={t("name")}
          value={editing ?? ""}
          onChange={setEditing}
          required
          error={tried && empty ? t("required") : undefined}
          hint={t("nameHint")}
        />
      </Modal>
    </>
  );
}
