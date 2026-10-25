/** Pure helpers for the custom-field "Single-select" options chip editor.
 * Each option carries a stable `id` (assigned once, independent of position)
 * so list keys stay stable across add/remove/reorder — see project house
 * rules on avoiding array-index keys for reorderable lists. */
export interface IOptionDraft {
  id: string;
  value: string;
}

/** Appends a trimmed, non-empty option. Blank input is a no-op (nothing added). */
export function addOption(options: IOptionDraft[], draft: IOptionDraft): IOptionDraft[] {
  const value = draft.value.trim();
  if (!value) return options;
  return [...options, { id: draft.id, value }];
}

/** Removes the option with the given id. No-op if the id isn't present. */
export function removeOption(options: IOptionDraft[], id: string): IOptionDraft[] {
  return options.filter((o) => o.id !== id);
}

/** Swaps the option with the given id one slot up or down. No-op at either boundary. */
export function moveOption(
  options: IOptionDraft[],
  id: string,
  direction: "up" | "down",
): IOptionDraft[] {
  const index = options.findIndex((o) => o.id === id);
  if (index === -1) return options;

  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= options.length) return options;

  const next = [...options];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** Flattens option drafts to the plain string[] the create/update payload expects. */
export function toOptionValues(options: IOptionDraft[]): string[] {
  return options.map((o) => o.value);
}

/** Seeds option drafts (with stable ids) from a persisted field's `options: string[]`. */
export function fromOptionValues(values: string[]): IOptionDraft[] {
  return values.map((value, i) => ({ id: `seed-${i}-${value}`, value }));
}
