"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { DocumentHeader } from "@/components/ui/document-header";
import { Drawer } from "@/components/ui/drawer";

/**
 * Toʻlov hujjati qobigʻi: `frame="page"` — toʻliq sahifa (prototip PaymentDoc: non-krosh «Toʻlovlar / raqam», sarlavha, holat,
 * oʻngda harakatlar); aks holda — yon oyna (eski oʻtishlar uchun).
 */
export function DocFrame(props: {
  frame?: "page";
  onClose: () => void;
  size?: "sm" | "lg";
  kind?: string;
  title: string;
  subtitle?: string;
  status?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations("payments");
  if (props.frame !== "page")
    return (
      <Drawer
        open
        onClose={props.onClose}
        size={props.size}
        kind={props.kind}
        title={props.title}
        subtitle={props.subtitle}
        status={props.status}
        actions={props.actions}
      >
        {props.children}
      </Drawer>
    );
  const mono = /^[A-Z]{2}-[A-Z]{3}-\d+$/.test(props.title);
  return (
    <div className="flex flex-col gap-4">
      <DocumentHeader
        parent={{ label: t("title"), href: "/payments" }}
        crumb={props.title}
        crumbMono={mono}
        title={props.kind ?? props.title}
        number={mono ? props.title : undefined}
        status={props.status}
        sub={props.subtitle}
        actions={props.actions}
      />
      <div className="mx-auto w-full max-w-[1280px] rounded-card border border-border bg-surface p-5 shadow-sm">{props.children}</div>
    </div>
  );
}
