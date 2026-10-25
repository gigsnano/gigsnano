import { APIError } from "@/services/api-error";
import { resolveSelectableSolution } from "@/lib/solutions/registry";
import type { ICreateSetupDraftPayload, IUpdateSetupDraftPayload } from "@/types";

import {
  getMockSolutionRegistry,
  makeMockSetupDraft,
  setupDrafts,
} from "../data/solutions";

type Handler = {
  method: string;
  pattern: RegExp;
  resolve: (match: RegExpMatchArray, body: unknown) => unknown;
};

const clone = <T>(value: T): T => structuredClone(value);

/**
 * Solution registry + resumable setup drafts (GIN-443 / GIN-446).
 *
 * Two rules are enforced here rather than in the UI, because the acceptance
 * criteria require them to hold against a replayed request: a disabled solution
 * cannot start a draft, and a write carrying a stale revision is a 409 instead
 * of a silent overwrite.
 */
export function makeSolutionHandlers(getCurrentUserId: () => string | null): Handler[] {
  const requireUser = () => {
    const userId = getCurrentUserId();
    if (!userId) throw new APIError(401, "Not authenticated");
    return userId;
  };

  const findDraft = (slug: string, draftId: string) => {
    const draft = setupDrafts.find((d) => d.id === draftId && d.workspace_slug === slug);
    if (!draft) throw new APIError(404, "Setup draft not found");
    return draft;
  };

  return [
    {
      method: "GET",
      pattern: /^\/workspaces\/([^/]+)\/solutions\/$/,
      resolve: () => clone(getMockSolutionRegistry()),
    },
    {
      method: "GET",
      pattern: /^\/workspaces\/([^/]+)\/setup-drafts\/$/,
      resolve: ([, slug]) => {
        const userId = requireUser();
        const now = Date.now();
        return clone(
          setupDrafts
            .filter(
              (d) =>
                d.workspace_slug === slug &&
                d.created_by === userId &&
                Date.parse(d.expires_at) > now,
            )
            .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at)),
        );
      },
    },
    {
      method: "POST",
      pattern: /^\/workspaces\/([^/]+)\/setup-drafts\/$/,
      resolve: ([, slug], body) => {
        const userId = requireUser();
        const payload = (body ?? {}) as ICreateSetupDraftPayload;
        // Throws with an actionable message for an unknown or disabled key, so a
        // gated solution can't be started by replaying this request.
        let solution;
        try {
          solution = resolveSelectableSolution(getMockSolutionRegistry(), payload.solution_key);
        } catch (error) {
          throw new APIError(422, (error as Error).message);
        }
        const draft = makeMockSetupDraft(
          slug,
          solution.key,
          payload.starting_point ?? null,
          userId,
        );
        setupDrafts.push(draft);
        return clone(draft);
      },
    },
    {
      method: "PATCH",
      pattern: /^\/workspaces\/([^/]+)\/setup-drafts\/([^/]+)\/$/,
      resolve: ([, slug, draftId], body) => {
        requireUser();
        const draft = findDraft(slug, draftId);
        const payload = (body ?? {}) as IUpdateSetupDraftPayload;
        if (payload.revision !== draft.revision) {
          throw new APIError(
            409,
            "This setup was changed somewhere else. Reload to get the latest version before continuing.",
          );
        }
        if (payload.step !== undefined) draft.step = payload.step;
        if (payload.values !== undefined) draft.values = payload.values;
        if (payload.starting_point !== undefined) draft.starting_point = payload.starting_point;
        draft.revision += 1;
        draft.updated_at = new Date().toISOString();
        return clone(draft);
      },
    },
    {
      method: "DELETE",
      pattern: /^\/workspaces\/([^/]+)\/setup-drafts\/([^/]+)\/$/,
      resolve: ([, slug, draftId]) => {
        requireUser();
        const draft = findDraft(slug, draftId);
        setupDrafts.splice(setupDrafts.indexOf(draft), 1);
        return { success: true };
      },
    },
  ];
}
