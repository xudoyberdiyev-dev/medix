"use client";

import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import { describeError } from "@/features/setup/form-error";
import { useSetAllBranches, type Employee } from "./api";

/** E3: Buxgalterga barcha filiallar doirasini berish / olish — faqat Direktor (xodim kartasidan). */
export function AllBranchesDialog({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const t = useTranslations("employees.allBranches");
  const set = useSetAllBranches();
  const enable = !employee.allBranches;
  const err = describeError(set.error);
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      tone={enable ? undefined : "danger"}
      title={enable ? t("grantTitle", { name: employee.fullName }) : t("revokeTitle", { name: employee.fullName })}
      primaryAction={{
        label: enable ? t("grant") : t("revoke"),
        loading: set.isPending,
        onClick: () =>
          set.mutate(
            { id: employee.id, enabled: enable },
            {
              onSuccess: () => (
                toast({ tone: "success", title: enable ? t("granted") : t("revoked"), description: employee.fullName }),
                onClose()
              ),
            },
          ),
      }}
    >
      <p className="text-text-secondary">{enable ? t("grantHint") : t("revokeHint")}</p>
      <p className="mt-2 text-text-secondary">{t("sessions")}</p>
      {err.message ? <Alert tone="danger" title={err.message} className="mt-4" /> : null}
    </Modal>
  );
}
