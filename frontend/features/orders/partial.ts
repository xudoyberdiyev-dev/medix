/** Qaytgan qism: har sotuv qatori uchun miqdor; QM asl sotuv narxida yoziladi, naqd — qolgan summagacha. */
export function partialTotals(lines: { id: number; qty: number; price: string }[], back: Record<number, string>, total: string) {
  let returned = 0n;
  let units = 0;
  let sold = 0;
  let invalid = false;
  for (const l of lines) {
    const raw = back[l.id] ?? "";
    const q = raw === "" ? 0 : Number(raw);
    sold += l.qty;
    if (!Number.isInteger(q) || q < 0 || q > l.qty) {
      invalid = true;
      continue;
    }
    units += q;
    returned += BigInt(l.price.replace(".", "")) * BigInt(q);
  }
  const net = BigInt(total.replace(".", "")) - returned;
  const fmt = (v: bigint) => {
    const neg = v < 0n;
    const a = (neg ? -v : v).toString().padStart(3, "0");
    return `${neg ? "-" : ""}${a.slice(0, -2)}.${a.slice(-2)}`;
  };
  return { returned: fmt(returned), net: fmt(net), units, invalid, all: units === sold && sold > 0 };
}
