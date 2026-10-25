import { create } from "zustand";

export interface IIssuesSelectionStore {
  selectedIds: string[];
  lastClickedId: string | null;
  toggle: (id: string) => void;
  /** Toggle one id, or select an inclusive range when shiftKey and anchor exist. */
  selectAt: (id: string, orderedIds: string[], shiftKey: boolean) => void;
  clear: () => void;
  isSelected: (id: string) => boolean;
}

/** Ephemeral multi-select state for the Work Items list view. */
export const useIssuesSelectionStore = create<IIssuesSelectionStore>((set, get) => ({
  selectedIds: [],
  lastClickedId: null,
  toggle: (id) =>
    set((s) => {
      const selected = s.selectedIds.includes(id);
      return {
        selectedIds: selected
          ? s.selectedIds.filter((x) => x !== id)
          : [...s.selectedIds, id],
        lastClickedId: id,
      };
    }),
  selectAt: (id, orderedIds, shiftKey) => {
    const { lastClickedId, selectedIds } = get();
    if (shiftKey && lastClickedId) {
      const from = orderedIds.indexOf(lastClickedId);
      const to = orderedIds.indexOf(id);
      if (from !== -1 && to !== -1) {
        const [start, end] = from < to ? [from, to] : [to, from];
        const range = orderedIds.slice(start, end + 1);
        const merged = new Set([...selectedIds, ...range]);
        set({ selectedIds: [...merged], lastClickedId: id });
        return;
      }
    }
    get().toggle(id);
  },
  clear: () => set({ selectedIds: [], lastClickedId: null }),
  isSelected: (id) => get().selectedIds.includes(id),
}));

export function isSelectionActive(store: Pick<IIssuesSelectionStore, "selectedIds">): boolean {
  return store.selectedIds.length > 0;
}
