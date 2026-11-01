"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

export interface AvatarProps {
  name: string;
  src?: string;
  size?: "sm" | "md" | "lg";
  /** Yonida ism yozilgan boʻlsa — true (ekran oʻquvchi ikki marta oʻqimasin). */
  decorative?: boolean;
}

const sizes = { sm: "size-6 text-[11px]", md: "size-8 text-table", lg: "size-10 text-subtitle" };

/** «Dilshod Aliyev» → «DA» */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toLocaleUpperCase("uz") ?? "")
    .join("");
}

export function Avatar({ name, src, size = "md", decorative = false }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  return (
    <span
      role={decorative ? undefined : "img"}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : name}
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-soft font-semibold text-primary-button",
        sizes[size],
      )}
    >
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- foydalanuvchi rasmi tashqi manbadan, oʻlchami kichik
        <img src={src} alt="" className="size-full object-cover" onError={() => setFailed(true)} />
      ) : (
        initials(name)
      )}
    </span>
  );
}
