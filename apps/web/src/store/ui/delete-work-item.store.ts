import { create } from "zustand";

import type { IStory } from "@/types";

/** The work item pending deletion, plus the query context needed to fire the
 * mutation and (optionally) navigate away afterwards. */
export interface IDeleteWorkItemTarget {
  story: IStory;
  workspaceSlug: string;
  projectId: string;
  cycleId?: string;
  /** Called after a successful delete — e.g. navigate off a detail page. */
  onDeleted?: () => void;
}

interface IDeleteWorkItemStore {
  target: IDeleteWorkItemTarget | null;
  /** Open the shared confirm dialog for `target`. */
  open: (target: IDeleteWorkItemTarget) => void;
  close: () => void;
}

/** One shared confirm-delete dialog driven imperatively from every delete
 * surface (row ⋯ menu, detail toolbar, command palette). Sites call `open(...)`;
 * `DeleteWorkItemDialogHost` (mounted once in WorkspaceShell) renders the dialog. */
export const useDeleteWorkItemStore = create<IDeleteWorkItemStore>((set) => ({
  target: null,
  open: (target) => set({ target }),
  close: () => set({ target: null }),
}));
