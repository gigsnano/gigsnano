import { create } from "zustand";

interface ICodebaseUiStore {
  /** The "Ask Codebase" screen — opened from the secondary-bar action
   * (project-header) or the node inspector, consumed by the codebase page. */
  askOpen: boolean;
  openAsk: () => void;
  closeAsk: () => void;
}

/** Transient UI state shared between the Codebase secondary-bar actions (mounted
 * in the layout via ProjectHeader) and the Codebase page body. */
export const useCodebaseUiStore = create<ICodebaseUiStore>((set) => ({
  askOpen: false,
  openAsk: () => set({ askOpen: true }),
  closeAsk: () => set({ askOpen: false }),
}));
