import { create } from "zustand";

interface IDraft {
  html: string;
  json: Record<string, unknown> | null;
}

interface ICommentDraftStore {
  /** In-flight comment text per work item. */
  drafts: Record<string, IDraft>;
  get: (storyId: string) => IDraft;
  set: (storyId: string, draft: IDraft) => void;
  clear: (storyId: string) => void;
}

const EMPTY: IDraft = { html: "<p></p>", json: null };

/**
 * Unsent comment text, held above the component tree so it survives a tab
 * change (GIN-480). Overview and Activity are two views of the same composer;
 * a draft started in one continues in the other.
 *
 * Deliberately NOT persisted — a half-typed comment surviving a browser restart
 * is a surprise, not a feature, and the store is keyed by story id so nothing
 * bleeds between work items.
 */
export const useCommentDraftStore = create<ICommentDraftStore>()((set, get) => ({
  drafts: {},
  get: (storyId) => get().drafts[storyId] ?? EMPTY,
  set: (storyId, draft) => set((s) => ({ drafts: { ...s.drafts, [storyId]: draft } })),
  clear: (storyId) =>
    set((s) => {
      const { [storyId]: _removed, ...rest } = s.drafts;
      return { drafts: rest };
    }),
}));
