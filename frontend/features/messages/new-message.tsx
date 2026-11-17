"use client";

import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { useState } from "react";
import { Radio } from "@/components/ui/selection-controls";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { useMe } from "@/features/auth/session";
import { ApiError } from "@/lib/api/client";
import { useRecipients, useStartThread, type Audience } from "./api";
import { Composer } from "./composer";

const ALL = "all";

/**
 * «Yangi xabar»: kimga — xodim(lar), butun rol (filial ichida yoki barcha filiallar) yoki butun filial
 * (rol/filial — faqat `messages.broadcast`). Pastda oddiy yozish maydoni (fayl va topshiriq bilan).
 */
export function NewMessage({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (threadId: number) => void }) {
  const t = useTranslations("chat");
  const me = useMe();
  const rec = useRecipients(open);
  const start = useStartThread();
  const [audience, setAudience] = useState<Exclude<Audience, "PERSON">>("PEOPLE");
  const [people, setPeople] = useState<string[]>([]);
  const [role, setRole] = useState<string | null>(null);
  const [branch, setBranch] = useState<string | null>(me.data?.branchId != null ? String(me.data.branchId) : null);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;
  const canBroadcast = rec.data?.canBroadcast ?? false;
  const allBranches = me.data?.allBranches ?? false;
  const branchOptions = [
    ...(audience === "ROLE" && allBranches ? [{ value: ALL, label: t("allBranches") }] : []),
    ...(rec.data?.branches ?? []).map((b) => ({ value: String(b.id), label: b.name })),
  ];

  function ready(): string | null {
    if (audience === "PEOPLE" && people.length === 0) return t("pickPeople");
    if (audience === "ROLE" && !role) return t("pickRole");
    if ((audience === "ROLE" || audience === "BRANCH") && !branch) return t("pickBranch");
    if (audience === "BRANCH" && branch === ALL) return t("pickBranch");
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-message-title"
      className="fixed inset-0 z-40 flex items-end justify-center bg-overlay md:items-center"
    >
      <div className="flex max-h-[92vh] w-full max-w-modal-lg flex-col overflow-hidden rounded-t-modal bg-surface shadow-overlay md:rounded-modal">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 id="new-message-title" className="text-section-title">
            {t("newMessage")}
          </h2>
          <button
            type="button"
            aria-label={t("close")}
            onClick={onClose}
            className="rounded-control p-1 text-text-secondary hover:bg-background"
          >
            <X size={20} strokeWidth={1.5} aria-hidden />
          </button>
        </div>
        <div className="flex flex-col gap-4 overflow-y-auto px-5 py-4">
          {canBroadcast ? (
            <fieldset className="flex flex-wrap gap-4">
              <legend className="mb-2 text-table text-text-secondary">{t("to")}</legend>
              {(["PEOPLE", "ROLE", "BRANCH"] as const).map((a) => (
                <Radio
                  key={a}
                  name="audience"
                  value={a}
                  label={t(`audience.${a}`)}
                  checked={audience === a}
                  onChange={() => (setAudience(a), setError(null))}
                />
              ))}
            </fieldset>
          ) : null}
          {audience === "PEOPLE" ? (
            <Select
              multiple
              searchable
              label={t("recipients")}
              loading={rec.isPending}
              value={people}
              onChange={(v) => (setPeople(v), setError(null))}
              options={(rec.data?.people ?? []).map((p) => ({
                value: String(p.id),
                label: p.fullName,
                sub: [p.roleName, p.branchName].filter(Boolean).join(" · "),
              }))}
              placeholder={t("pickPeople")}
              error={error ?? undefined}
            />
          ) : null}
          {audience === "ROLE" ? (
            <Select
              label={t("role")}
              searchable
              value={role}
              onChange={(v) => (setRole(v), setError(null))}
              options={(rec.data?.roles ?? []).map((r) => ({ value: r.code, label: r.name }))}
              placeholder={t("pickRole")}
              error={error && !role ? error : undefined}
            />
          ) : null}
          {audience === "ROLE" || audience === "BRANCH" ? (
            <Select
              label={t("branch")}
              value={branch}
              onChange={(v) => (setBranch(v), setError(null))}
              options={branchOptions.filter((o) => audience === "ROLE" || o.value !== ALL)}
              placeholder={t("pickBranch")}
              error={error && role ? error : undefined}
            />
          ) : null}
        </div>
        <Composer
          autoFocus
          pending={start.isPending}
          onSend={async (message) => {
            const problem = ready();
            if (problem) {
              setError(problem);
              throw new Error(problem);
            }
            try {
              const r = await start.mutateAsync({
                audience,
                employeeIds: audience === "PEOPLE" ? people.map(Number) : undefined,
                roleCode: audience === "ROLE" ? (role ?? undefined) : undefined,
                branchId: audience === "PEOPLE" || branch === ALL || !branch ? undefined : Number(branch),
                message,
              });
              onCreated(r.threadId);
            } catch (e) {
              toast({ tone: "danger", title: e instanceof ApiError && e.message ? e.message : t("sendFailed") });
              throw e;
            }
          }}
        />
      </div>
    </div>
  );
}
