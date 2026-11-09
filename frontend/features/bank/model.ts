/** Hisob raqami 4 tadan guruhlanadi (prototip): «20208000900412873001» → «2020 8000 9004 1287 3001». */
export function groupAccountNo(no: string): string {
  return no.replace(/\s+/g, "").replace(/(.{4})(?=.)/g, "$1 ");
}

/** «2026-10-03» → «03.10.2026» (sana — vaqt mintaqasisiz). */
export function isoToDay(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}
