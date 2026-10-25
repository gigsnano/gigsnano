import type { ID, ISODateString } from "./common";
import type { IMemberPreview } from "./member";
import { EMemberStatus } from "./member";
import type { ESolutionKey } from "./solution-key";

/** Whether the project's BMAD Sprint-0 (planning) has been generated / completed. */
export enum ESprintZeroStatus {
  NotStarted = "not_started",
  InProgress = "in_progress",
  Complete = "complete",
}

/** How the project was created — drives the Sprint-0 story set (see BMAD guide). */
export enum EProjectFlow {
  Fresh = "fresh",
  Existing = "existing",
}

/** State of the backend's clone of a linked GitHub repo (brownfield flow). */
export enum ECloneStatus {
  None = "none",
  Pending = "pending",
  Cloning = "cloning",
  Ready = "ready",
  Failed = "failed",
}

/** State of the backend's codebase index (repo-aware graph feature — Plan 1). */
export enum EIndexStatus {
  None = "none",
  Pending = "pending",
  Indexing = "indexing",
  Ready = "ready",
  Failed = "failed",
}

export type TPlanningMethod = "automatic" | "simple" | "points" | "time";

export interface IProject {
  id: ID;
  workspace_slug: string;
  name: string;
  /** Short prefix used for story IDs, e.g. "GN". */
  identifier: string;
  /** Cover image shown on the project card / list / table row. */
  cover_image_url: string;
  /** Optional emoji badge shown over the cover. */
  logo_emoji: string | null;
  /** Optional badge background tint (CSS color string). */
  logo_color: string | null;
  /** Uploaded logo image (capability URL). Takes precedence over the emoji (GIN-44). */
  logo_image_url: string | null;
  /** Planned schedule (date-only YYYY-MM-DD). Drives the Gantt/timeline view. */
  start_date: ISODateString;
  target_date: ISODateString;
  description: string;
  /** Rich-text (HTML) body of the project Overview document — Notion-style editor. */
  overview: string;
  lead_id: ID | null;
  member_count: number;
  /** Capped preview of assigned members for the card AvatarGroup (denormalized). */
  members: IMemberPreview[];
  flow: EProjectFlow;
  /** When false, the UX Sprint-0 card is omitted (bmad-workflow-guide §6). */
  has_ui: boolean;
  /** Planning/estimation method (GIN-330). "automatic" = estimate-free. */
  planning_method: TPlanningMethod;
  planning_method_updated_at: ISODateString | null;
  sprint_zero_status: ESprintZeroStatus;
  /** 0–100 rollup of Sprint-0 story completion. */
  sprint_zero_progress: number;
  /** Linked GitHub repo (brownfield flow), e.g. "acme/widgets". */
  repo_full_name: string | null;
  /** The repo's default branch, recorded at clone time. `null` until cloned. */
  repo_default_branch: string | null;
  /** Backend clone state for the linked repo. */
  clone_status: ECloneStatus;
  /** Error message if `clone_status` is `Failed`. */
  clone_error: string | null;
  /** Backend codebase-index state (repo-aware graph feature — Plan 1). */
  index_status: EIndexStatus;
  /** Error message if `index_status` is `Failed`. */
  index_error: string | null;
  /** Short commit SHA the code graph was built from, once `index_status` is `Ready`. */
  indexed_commit_sha: string | null;
  /** When the index last completed successfully. */
  indexed_at: ISODateString | null;
  /**
   * Which solution owns this container (GIN-443). Optional and additive: rows
   * that predate the solution model omit it and read through as
   * `software_delivery` — see `lib/solutions/container-adapter.ts`.
   */
  solution_key?: ESolutionKey;
  /** The solution-definition version the project was created against. */
  solution_version?: number;
  created_at: ISODateString;
  updated_at: ISODateString;
}

/** Payload for creating a project (matches the backend's POST body). */
export interface ICreateProjectPayload {
  name: string;
  identifier: string;
  description?: string;
  flow: EProjectFlow;
  has_ui?: boolean;
  cover_image_url: string;
  logo_emoji?: string | null;
  logo_color?: string | null;
  logo_image_url?: string | null;
  start_date?: ISODateString;
  target_date?: ISODateString;
  repo_full_name?: string | null;
  /** Create only the project — no Sprint-0 cycle or seeded work items. */
  blank?: boolean;
}

/** Payload for requesting a project transfer to another workspace (GIN-85). */
export interface ITransferProjectPayload {
  destination_workspace_slug: string;
}

export type ETransferStatus = "pending" | "accepted" | "declined" | "cancelled";

/** A GitHub-style project transfer request awaiting the destination owner's
 *  acceptance (GIN-85). Returned by the request/get/accept endpoints. */
export interface ITransferRequest {
  id: string;
  project_id: string;
  project_name: string;
  project_identifier: string;
  source_workspace_slug: string;
  source_workspace_name: string;
  dest_workspace_slug: string;
  dest_workspace_name: string;
  invited_email: string;
  status: ETransferStatus;
  created_at: ISODateString;
}

/** The projects-page view modes (icon switcher in the secondary header). */
export enum EProjectView {
  Gallery = "gallery",
  List = "list",
  Table = "table",
  Timeline = "timeline",
}

/** Project-scoped roles, separate from workspace roles (GIN-318). OWNER is the top
 * project authority (transfer ownership / delete project). */
export enum EProjectRole {
  Owner = "owner",
  Admin = "admin",
  Member = "member",
  Viewer = "viewer",
}

export interface IProjectMember {
  id: ID;
  project_id: ID;
  user_id: ID;
  display_name: string;
  email: string;
  avatar_url: string | null;
  role: EProjectRole;
  status: EMemberStatus;
}
