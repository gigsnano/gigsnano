import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Per-user preference for the "Staff this work item" panel. Collapsed by default
 * (it's an opt-in feature — not every team staffs via the marketplace), and the
 * choice persists so someone who collapses it never has it expanded on them again.
 */
interface IStaffPanelStore {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const useStaffPanelStore = create<IStaffPanelStore>()(
  persist(
    (set) => ({
      open: false,
      setOpen: (open) => set({ open }),
    }),
    { name: "gn.staff-panel" },
  ),
);
