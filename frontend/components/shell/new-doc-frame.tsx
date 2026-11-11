"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { DocTabs } from "@/components/ui/doc-tabs";
import { DocumentHeader } from "@/components/ui/document-header";
import { HubTabs } from "@/components/shell/hub-tabs";
import type { HubKey } from "@/components/shell/nav";
import { Steps } from "@/features/payments/payment-doc-page";

/**
 * Yangi (hali saqlanmagan) hujjat sahifasi ramkasi — prototip `StockDocs` (QM/HC/QY, yangi hujjat):
 * boʻlim yorliqlari, sarlavha + «Qoralama» holati, bosqichlar «Qoralama → Tasdiqlangan», «Hujjat / Tarix» yorliqlari.
 */
export function NewDocFrame({
  hub,
  parent,
  crumb,
  title,
  actions,
  children,
}: {
  hub?: HubKey;
  parent: { label: string; href: string };
  crumb: string;
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations("ui.status");
  return (
    <div className="flex min-w-0 flex-col gap-4 pb-12">
      {hub ? <HubTabs hub={hub} className="-mb-1" /> : null}
      <DocumentHeader
        parent={parent}
        crumb={crumb}
        title={title}
        status={<Badge status="draft" />}
        meta={
          <Steps
            steps={[
              { label: t("draft"), state: "cur" },
              { label: t("approved"), state: "next" },
            ]}
          />
        }
        actions={actions}
      />
      <DocTabs events={[]}>{children}</DocTabs>
    </div>
  );
}
