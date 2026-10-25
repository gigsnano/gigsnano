import { create } from "zustand";

interface IProjectsFlyoutStore {
  open: boolean;
  toggle: () => void;
  setOpen: (open: boolean) => void;
}

/** Rail B extended project list flyout (Plane: `isExtendedProjectSidebarOpened`). */
export const useProjectsFlyoutStore = create<IProjectsFlyoutStore>((set) => ({
  open: false,
  toggle: () => set((s) => ({ open: !s.open })),
  setOpen: (open) => set({ open }),
}));

export const EXTENDED_PROJECT_SIDEBAR_WIDTH = 300;
export const PROJECTS_FLYOUT_TOGGLE_ID = "extended-project-sidebar-toggle";
