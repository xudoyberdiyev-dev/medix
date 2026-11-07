import { messagesToCyrillic, type Messages } from "./translit.ts";

/** Avtomatik oʻgirma + qoʻlda tuzatishlar (overrides kalitlari ustun). */
export function buildCyrillic(latin: Messages, overrides: Messages): Messages {
  return merge(messagesToCyrillic(latin), overrides);
}

function merge(base: Messages, extra: Messages): Messages {
  const out: Messages = { ...base };
  for (const [k, v] of Object.entries(extra)) {
    const b = out[k];
    out[k] = typeof v === "object" && typeof b === "object" ? merge(b, v) : v;
  }
  return out;
}
