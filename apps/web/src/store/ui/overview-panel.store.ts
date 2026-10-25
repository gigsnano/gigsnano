import { create } from "zustand";
import { persist } from "zustand/middleware";

export type OverviewTab = "state" | "updates" | "activity" | "workload";

interface IOverviewPanelStore {
  /** Right-rail collapsed state on the project Overview. */
  collapsed: boolean;
  /** Active right-rail tab. */
  tab: OverviewTab;
  toggleCollapsed: () => void;
  setCollapsed: (collapsed: boolean) => void;
  setTab: (tab: OverviewTab) => void;
}

/** Pure UI state for the Overview right rail (collapse + active tab). */
export const useOverviewPanelStore = create<IOverviewPanelStore>()(
  persist(
    (set) => ({
      collapsed: false,
      tab: "state",
      toggleCollapsed: () => set((s) => ({ collapsed: !s.collapsed })),
      setCollapsed: (collapsed) => set({ collapsed }),
      setTab: (tab) => set({ tab }),
    }),
    { name: "gn.overview-panel" },
  ),
);
