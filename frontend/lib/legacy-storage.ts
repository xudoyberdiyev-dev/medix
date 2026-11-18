/**
 * O21 mos kelish davri: brauzer xotirasidagi eski nomli kalitlar (`medix-…`, `medix.…`) yangi nomga
 * (`yuzplus-…`, `yuzplus.…`) bir marta koʻchiriladi — saqlangan koʻrinishlar, ustunlar, filial tanlovi yoʻqolmasin.
 * Yangi kalit allaqachon boʻlsa, eskisi shunchaki oʻchiriladi. Modul yuklanganda (brauzerda) bir marta ishlaydi.
 */
const LEGACY_PREFIX = "medix";
const PREFIX = "yuzplus";

export function migrateLegacyKeys(storage: Storage): number {
  const legacy: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && (key.startsWith(`${LEGACY_PREFIX}-`) || key.startsWith(`${LEGACY_PREFIX}.`))) legacy.push(key);
  }
  for (const key of legacy) {
    const next = PREFIX + key.slice(LEGACY_PREFIX.length);
    const value = storage.getItem(key);
    if (value !== null && storage.getItem(next) === null) storage.setItem(next, value);
    storage.removeItem(key);
  }
  return legacy.length;
}

function migrateAll(): void {
  if (typeof window === "undefined") return;
  for (const get of [() => window.localStorage, () => window.sessionStorage]) {
    try {
      migrateLegacyKeys(get());
    } catch {
      // Xotira yopiq (maxfiy rejim va h.k.) — koʻchirish shart emas.
    }
  }
}

migrateAll();
