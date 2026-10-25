import { EProjectFlow } from "@/types";
import {
  type ICreateProjectDraft,
  makeEmptyDraft,
} from "@/lib/projects/create-project-draft";

/**
 * The adapter between a setup draft's opaque `values` blob and the Software
 * Delivery form's own state (GIN-446).
 *
 * `ISetupDraft.values` is `Record<string, unknown>` on purpose — the platform
 * stores whatever a solution's intake collects and never interprets it. That
 * makes this boundary the one place allowed to know the Software Delivery shape,
 * and the reason `draftFromValues` treats every field as untrusted: the blob may
 * be empty (a draft that was never typed into), partial (a shape from an older
 * build), or written by a different client.
 *
 * Keys mirror the project create payload rather than the form's local camelCase
 * names, so the backend can map a resumed draft onto `POST /projects/` directly.
 */

export function softwareDeliveryValues(draft: ICreateProjectDraft): Record<string, unknown> {
  return {
    name: draft.name,
    identifier: draft.identifier,
    identifier_edited: draft.idEdited,
    description: draft.description,
    flow: draft.flow,
    has_ui: draft.hasUi,
    cover_image_url: draft.coverUrl,
    logo_emoji: draft.emoji,
    logo_image_url: draft.logoImageUrl,
    repo_full_name: draft.repoFullName,
  };
}

/**
 * Rebuild the form snapshot from a stored blob, defaulting anything missing or
 * mistyped. Returns `null` for an empty blob so the caller can fall back to a
 * fresh form seeded from the draft's starting point.
 */
export function draftFromValues(
  values: Record<string, unknown> | null | undefined,
  startingFlow: EProjectFlow = EProjectFlow.Fresh,
): ICreateProjectDraft | null {
  if (!values || typeof values !== "object" || Object.keys(values).length === 0) return null;

  const base = makeEmptyDraft(startingFlow);
  return {
    name: str(values.name) ?? base.name,
    identifier: str(values.identifier) ?? base.identifier,
    idEdited: bool(values.identifier_edited) ?? base.idEdited,
    description: str(values.description) ?? base.description,
    flow: flow(values.flow) ?? base.flow,
    hasUi: bool(values.has_ui) ?? base.hasUi,
    coverUrl: str(values.cover_image_url) ?? base.coverUrl,
    emoji: str(values.logo_emoji) ?? base.emoji,
    logoImageUrl: str(values.logo_image_url) ?? null,
    repoFullName: str(values.repo_full_name) ?? null,
  };
}

/**
 * What to call a draft in the "Continue setup" list. Two drafts of the same
 * solution are otherwise indistinguishable, so the name the user typed wins over
 * the solution's name.
 */
export function draftDisplayName(
  values: Record<string, unknown> | null | undefined,
): string | null {
  const name = str(values?.name)?.trim();
  return name ? name : null;
}

const str = (value: unknown): string | null => (typeof value === "string" ? value : null);
const bool = (value: unknown): boolean | null => (typeof value === "boolean" ? value : null);
const flow = (value: unknown): EProjectFlow | null =>
  value === EProjectFlow.Fresh || value === EProjectFlow.Existing ? value : null;
