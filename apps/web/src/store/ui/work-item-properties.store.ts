import { create } from "zustand";
import { persist } from "zustand/middleware";

interface IWorkItemPropertiesStore {
  /** Inline drawer collapsed to nothing at xl and up. Persisted: it is a layout preference. */
  collapsed: boolean;
  /** The overlay sheet below xl. NOT persisted — a sheet that reopens itself on
   *  every visit is a surprise, not a restored preference. */
  sheetOpen: boolean;
  toggle: () => void;
  setCollapsed: (collapsed: boolean) => void;
  setSheetOpen: (open: boolean) => void;
  /** Reveal Properties on whichever surface the viewport is using. */
  open: () => void;
}

/** Pure UI state for the work-item Properties drawer (GIN-479). */
export const useWorkItemPropertiesStore = create<IWorkItemPropertiesStore>()(
  persist(
    (set) => ({
      collapsed: false,
      sheetOpen: false,
      toggle: () => set((s) => ({ collapsed: !s.collapsed })),
      setCollapsed: (collapsed) => set({ collapsed }),
      setSheetOpen: (sheetOpen) => set({ sheetOpen }),
      open: () => set({ collapsed: false, sheetOpen: true }),
    }),
    { name: "gn.work-item-properties", partialize: (s) => ({ collapsed: s.collapsed }) },
  ),
);
