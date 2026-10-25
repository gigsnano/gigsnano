import { EProjectFlow } from "@/types";
import { DEFAULT_PROJECT_COVER, PROJECT_EMOJI_PALETTE } from "@/constants/project-gallery";

/**
 * A snapshot of the Create-Project dialog's form state, persisted across the
 * GitHub OAuth full-page redirect. Connecting GitHub navigates away from the
 * SPA (`window.location.href`), destroying the dialog's local React state; we
 * stash this in sessionStorage so the flow can resume where the user left off.
 */
export interface ICreateProjectDraft {
  name: string;
  identifier: string;
  idEdited: boolean;
  description: string;
  flow: EProjectFlow;
  hasUi: boolean;
  coverUrl: string;
  emoji: string;
  logoImageUrl: string | null;
  repoFullName: string | null;
}

const DRAFT_KEY = "gn_create_project_draft";

/** A blank draft, defaulted to the given flow. */
export function makeEmptyDraft(flow: EProjectFlow = EProjectFlow.Fresh): ICreateProjectDraft {
  return {
    name: "",
    identifier: "",
    idEdited: false,
    description: "",
    flow,
    hasUi: true,
    coverUrl: DEFAULT_PROJECT_COVER.url,
    emoji: PROJECT_EMOJI_PALETTE[0],
    logoImageUrl: null,
    repoFullName: null,
  };
}

/** Persist a draft scoped to a workspace, so it can't leak into another. */
export function saveCreateProjectDraft(workspaceSlug: string, draft: ICreateProjectDraft) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ workspaceSlug, draft }));
  } catch {
    // storage unavailable (private mode / quota) — restore is best-effort.
  }
}

/** Read the draft without removing it — safe to call during render (pure). */
export function peekCreateProjectDraft(workspaceSlug: string): ICreateProjectDraft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { workspaceSlug?: string; draft?: ICreateProjectDraft };
    return parsed.workspaceSlug === workspaceSlug && parsed.draft ? parsed.draft : null;
  } catch {
    return null;
  }
}

/** Remove the persisted draft (call from an effect/handler, not during render). */
export function clearCreateProjectDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // storage unavailable — nothing to clear.
  }
}
