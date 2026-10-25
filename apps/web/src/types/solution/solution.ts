import type { ID, ISODateString } from "@/types/common";
import { ESolutionKey } from "@gigsnano/core";

export { ESolutionKey };

/**
 * The solution platform contract (GIN-443).
 *
 * A *solution* is an opinionated domain package — not a workflow builder and not
 * a generic "mode". A *container* is one instance of a solution inside a
 * workspace. Existing `project` records are the Software Delivery implementation
 * of a container; see `lib/solutions/container-adapter.ts` for the compatibility
 * adapter that reads them as containers without a physical migration.
 */

/**
 * What a solution's containers support. Platform code branches on capabilities
 * rather than on the solution key, so a third solution needs no new call sites.
 */
export enum ESolutionCapability {
  Journeys = "journeys",
  Repositories = "repositories",
  DomainObjects = "domain_objects",
  Dashboards = "dashboards",
  Integrations = "integrations",
  Agents = "agents",
}

export enum EContainerLifecycle {
  Draft = "draft",
  Active = "active",
  Archived = "archived",
}

/**
 * Why a solution is (not) offered in the chooser. Anything other than
 * `Available` must carry an `availability_reason` the UI can show verbatim.
 */
export enum ESolutionAvailability {
  Available = "available",
  /** Workspace feature flag is off — an admin has to enable it. */
  Disabled = "disabled",
  /** Enabled for the workspace, but this member lacks the permission. */
  RequiresPermission = "requires_permission",
}

/** One branch of a solution's intake — "Start from an idea", "Import contracts". */
export interface ISolutionStartingPoint {
  key: string;
  label: string;
  hint: string;
  /** Highlighted as the recommended path in the chooser and the wizard. */
  recommended: boolean;
  /** When set, the starting point is only offered if the solution has it. */
  requires_capability: ESolutionCapability | null;
}

/** A navigation entry contributed by the solution (GIN-447 composes these). */
export interface ISolutionNavigationEntry {
  key: string;
  label: string;
  /** Path relative to the container root, e.g. "issues" or "contracts". */
  path: string;
  requires_capability: ESolutionCapability | null;
}

/**
 * Versioned solution metadata. `version` is bumped whenever the definition's
 * shape or content changes, which is what lets a stale setup draft be detected
 * and re-validated instead of silently resumed against new rules.
 */
export interface ISolutionDefinition {
  key: ESolutionKey;
  version: number;
  name: string;
  /** The measurable outcome — the chooser card's promise, not a category. */
  outcome: string;
  description: string;
  /** What this solution calls its container, e.g. "project". */
  container_noun: string;
  capabilities: ESolutionCapability[];
  starting_points: ISolutionStartingPoint[];
  navigation: ISolutionNavigationEntry[];
  availability: ESolutionAvailability;
  availability_reason: string | null;
}

/**
 * The registry envelope. `revision` changes whenever any definition changes, so
 * caches can be invalidated without comparing every definition.
 */
export interface ISolutionRegistry {
  revision: string;
  solutions: ISolutionDefinition[];
}

/** What a container points at in its domain — `project` for Software Delivery. */
export interface IContainerDomainRef {
  kind: string;
  id: ID;
}

/**
 * The solution-aware container contract. Deliberately free of software-only
 * fields (repository, Sprint-0, has_ui) so a Revenue Assurance container is
 * expressible without them.
 */
export interface ISolutionContainer {
  id: ID;
  workspace_slug: string;
  solution_key: ESolutionKey;
  /** The definition version this container was created against. */
  solution_version: number;
  display_name: string;
  lifecycle: EContainerLifecycle;
  /** Solution-specific settings, opaque to platform code. */
  configuration: Record<string, unknown>;
  feature_flags: string[];
  domain_ref: IContainerDomainRef | null;
  created_at: ISODateString;
  updated_at: ISODateString;
}

/**
 * A resumable setup draft (GIN-446). Created only *after* a solution is chosen,
 * and never implies a container exists — that is the point of the draft.
 */
export interface ISetupDraft {
  id: ID;
  workspace_slug: string;
  solution_key: ESolutionKey;
  /** Definition version at the time of the last edit. */
  solution_version: number;
  starting_point: string | null;
  /** The intake step to resume at. Opaque to the platform; owned by GIN-444. */
  step: string;
  /** Collected answers so far, shaped by the solution's intake definition. */
  values: Record<string, unknown>;
  created_by: ID;
  /**
   * Optimistic-concurrency token. A write carrying a stale revision is rejected
   * with 409 rather than overwriting another device's edit.
   */
  revision: number;
  created_at: ISODateString;
  updated_at: ISODateString;
  /** When the draft is eligible for cleanup, per the retention policy. */
  expires_at: ISODateString;
}

export interface ICreateSetupDraftPayload {
  solution_key: ESolutionKey;
  starting_point?: string | null;
}

export interface IUpdateSetupDraftPayload {
  step?: string;
  values?: Record<string, unknown>;
  starting_point?: string | null;
  /** The revision the client last read. Omit only for a forced overwrite. */
  revision: number;
}
