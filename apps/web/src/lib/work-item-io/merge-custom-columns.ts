export interface IPickerColumn {
  key: string;
  label: string;
}

/**
 * Appends one picker column per custom-field definition (`cf:{id}`) to the
 * static base column list, preserving base order and deduping by key.
 * Pure — no state, safe to call on every render.
 */
export function mergeCustomFieldColumns(
  base: IPickerColumn[],
  defs: { id: string; name: string }[],
): IPickerColumn[] {
  // Single pass, deduping against the base AND earlier defs (a repeated id
  // never yields a duplicate `cf:` key / React-key collision).
  const seen = new Set(base.map((c) => c.key));
  const custom: IPickerColumn[] = [];
  for (const d of defs) {
    const key = `cf:${d.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    custom.push({ key, label: d.name });
  }
  return [...base, ...custom];
}
