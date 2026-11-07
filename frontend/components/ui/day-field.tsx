"use client";

import { useState } from "react";
import { TextField } from "@/components/ui/text-field";
import { formatIsoDate, parseUzDate } from "@/features/counterparties/api";

/** Sana filtri (KK.OO.YYYY): toʻgʻri sana kiritilganda yoki tozalanganda `onApply` (ISO yoki null). */
export function DayField({
  label,
  value,
  onApply,
  invalid,
}: {
  label: string;
  value: string | null;
  onApply: (iso: string | null) => void;
  invalid: string;
}) {
  const [text, setText] = useState(formatIsoDate(value));
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    // URL tashqaridan oʻzgardi (koʻrinish, tozalash) — maydon ham yangilanadi
    setSeen(value);
    setText(formatIsoDate(value));
  }
  const parsed = parseUzDate(text);
  return (
    <div className="w-36">
      <TextField
        label={label}
        size="sm"
        value={text}
        placeholder="04.10.2026"
        error={parsed === null ? invalid : undefined}
        onChange={(v) => {
          setText(v);
          const iso = parseUzDate(v);
          if (iso !== null && (iso ?? null) !== value) onApply(iso ?? null);
        }}
      />
    </div>
  );
}
