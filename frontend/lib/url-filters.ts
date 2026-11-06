/** Hisobotdan oʻtish: ?<id>=…&<nom>=Nomi (masalan, Savdo hisoboti qatori → Buyurtmalar). */
export function idParam(
  params: Pick<URLSearchParams, "get">,
  idKey: string,
  nameKey: string,
  fallback: string,
): { id: number; name: string } | null {
  const id = Number(params.get(idKey));
  return Number.isInteger(id) && id > 0 ? { id, name: params.get(nameKey) ?? `${fallback} #${id}` } : null;
}
