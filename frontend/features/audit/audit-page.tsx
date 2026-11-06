"use client";

import { useQuery } from "@tanstack/react-query";
import { ScrollText } from "lucide-react";
import { useState } from "react";
import { Select } from "@/components/ui/select";
import { EmptyState, ErrorState, ForbiddenState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import type { PageSize } from "@/components/ui/pagination";
import { api, ApiError, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { formatDateTime } from "@/lib/format";

type AuditRow = components["schemas"]["AuditRow"];

/** Amal kalitlari → oʻzbekcha nom. Nomaʼlum kalit oʻzi koʻrsatiladi. */
export const AUDIT_ACTIONS: Record<string, string> = {
  "auth.login": "Tizimga kirdi",
  "auth.loginFailed": "Notoʻgʻri parol bilan kirish urinishi",
  "auth.loginBlocked": "Bloklangan hisob bilan kirish urinishi",
  "auth.passwordChanged": "Parolni almashtirdi",
  "employee.create": "Xodim qoʻshildi",
  "employee.block": "Xodim bloklandi",
  "employee.unblock": "Xodim blokdan chiqarildi",
  "employee.resetPassword": "Vaqtinchalik parol berildi",
  "company.create": "Kompaniya yaratildi",
  "company.update": "Kompaniya oʻzgartirildi",
  "branch.create": "Filial qoʻshildi",
  "branch.update": "Filial oʻzgartirildi",
  "warehouse.create": "Ombor qoʻshildi",
  "setup.complete": "Sozlash ustasi yakunlandi",
};

const ENTITY_OPTIONS = [
  { value: "employee", label: "Xodimlar" },
  { value: "branch", label: "Filiallar" },
  { value: "warehouse", label: "Omborlar" },
  { value: "company", label: "Kompaniya" },
];

export function AuditPage() {
  const [entityType, setEntityType] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(50);
  const audit = useQuery({
    queryKey: ["audit", entityType, page, pageSize],
    queryFn: () => unwrap(api.GET("/api/audit", { params: { query: { entityType: entityType ?? undefined, page, size: pageSize } } })),
  });

  if (audit.error instanceof ApiError && audit.error.isForbidden)
    return <ForbiddenState description="Audit jurnalini Direktor va Bosh administrator koʻradi." />;

  const columns: TableColumn<AuditRow>[] = [
    { key: "occurredAt", title: "Vaqt", render: (r) => <span className="tabular">{formatDateTime(new Date(r.occurredAt))}</span> },
    { key: "employeeName", title: "Xodim", render: (r) => r.employeeName ?? "Tizim" },
    { key: "action", title: "Amal", render: (r) => AUDIT_ACTIONS[r.action] ?? r.action },
    { key: "entity", title: "Obyekt", mono: true, render: (r) => `${r.entityType}${r.entityId ? ` #${r.entityId}` : ""}` },
    { key: "reason", title: "Sabab", render: (r) => r.reason ?? "" },
  ];

  return (
    <>
      <h1 className="mb-4 text-page-title">Audit jurnali</h1>
      {audit.error ? (
        <ErrorState onRetry={() => audit.refetch()} />
      ) : (
        <Table
          caption="Audit jurnali"
          density="compact"
          columns={columns}
          rows={audit.data?.items ?? []}
          rowKey={(r) => String(r.id)}
          loading={audit.isPending}
          toolbar={
            <div className="w-64">
              <Select
                label="Obyekt turi"
                size="sm"
                value={entityType}
                placeholder="Hammasi"
                onChange={(v) => {
                  setEntityType(v);
                  setPage(1);
                }}
                options={ENTITY_OPTIONS}
              />
            </div>
          }
          emptyState={
            <EmptyState
              icon={ScrollText}
              title="Yozuvlar yoʻq"
              description="Tizimdagi har bir muhim amal shu yerda koʻrinadi: kim, qachon, nima oʻzgardi."
            />
          }
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
