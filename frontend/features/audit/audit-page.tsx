"use client";

import { useQuery } from "@tanstack/react-query";
import { ScrollText } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Select } from "@/components/ui/select";
import { EmptyState, ErrorState, ForbiddenState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import type { PageSize } from "@/components/ui/pagination";
import { api, ApiError, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { formatDateTime } from "@/lib/format";

type AuditRow = components["schemas"]["AuditRow"];

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

const ENTITY_TYPES = ["employee", "branch", "warehouse", "company"] as const;

export function AuditPage() {
  const t = useTranslations("audit");
  const [entityType, setEntityType] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(50);
  const audit = useQuery({
    queryKey: ["audit", entityType, page, pageSize],
    queryFn: () => unwrap(api.GET("/api/audit", { params: { query: { entityType: entityType ?? undefined, page, size: pageSize } } })),
  });

  if (audit.error instanceof ApiError && audit.error.isForbidden) return <ForbiddenState description={t("forbidden")} />;

  const columns: TableColumn<AuditRow>[] = [
    { key: "occurredAt", title: t("time"), render: (r) => <span className="tabular">{formatDateTime(new Date(r.occurredAt))}</span> },
    { key: "employeeName", title: t("employee"), render: (r) => r.employeeName ?? t("system") },
    { key: "action", title: t("action"), render: (r) => (isKnownAction(r.action) ? t(`actions.${r.action}`) : r.action) },
    { key: "entity", title: t("entity"), mono: true, render: (r) => `${r.entityType}${r.entityId ? ` #${r.entityId}` : ""}` },
    { key: "reason", title: t("reason"), render: (r) => r.reason ?? "" },
  ];

  return (
    <>
      <h1 className="mb-4 text-page-title">{t("title")}</h1>
      {audit.error ? (
        <ErrorState onRetry={() => audit.refetch()} />
      ) : (
        <Table
          caption={t("title")}
          density="compact"
          columns={columns}
          rows={audit.data?.items ?? []}
          rowKey={(r) => String(r.id)}
          loading={audit.isPending}
          toolbar={
            <div className="w-64">
              <Select
                label={t("entityType")}
                size="sm"
                value={entityType}
                placeholder={t("all")}
                onChange={(v) => {
                  setEntityType(v);
                  setPage(1);
                }}
                options={ENTITY_TYPES.map((value) => ({ value, label: t(`entities.${value}`) }))}
              />
            </div>
          }
          emptyState={<EmptyState icon={ScrollText} title={t("emptyTitle")} description={t("emptyDescription")} />}
          pagination={{
            page,
            pageSize,
            total: audit.data?.total ?? 0,
            onPageChange: setPage,
            onPageSizeChange: (s) => {
              setPageSize(s);
              setPage(1);
            },
          }}
        />
      )}
    </>
  );
}
