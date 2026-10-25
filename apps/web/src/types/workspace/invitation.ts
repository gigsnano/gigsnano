import type { ID, ISODateString } from "@/types/common";
import type { EProjectRole } from "@/types/project/project";
import type { EWorkspaceRole } from "@/types/workspace/workspace";

/** Project access an invitation carries, applied the moment it is redeemed.
 *
 *  A brand-new invitee has no user account, so there is nothing for a project
 *  membership row to point at until they accept — the promise lives on the
 *  invitation instead. */
export interface IProjectGrant {
  project_id: ID;
  role: EProjectRole;
}

/** Mirrors the backend's `EInvitationStatus`. `Expired` is derived server-side
 *  from `expires_at` — nothing sweeps the table, so a pending row past its
 *  expiry already arrives here as `expired`. */
export enum EInvitationStatus {
  Pending = "pending",
  Accepted = "accepted",
  Expired = "expired",
  Revoked = "revoked",
  DeliveryFailed = "delivery_failed",
}

export interface IWorkspaceInvitation {
  id: ID;
  workspace_slug: string;
  email: string;
  role: EWorkspaceRole;
  invited_by_name: string;
  created_at: ISODateString;
  status: EInvitationStatus;
  expires_at: ISODateString;
  last_sent_at: ISODateString | null;
  accepted_at: ISODateString | null;
  resend_count: number;
  /** Projects this person joins on acceptance. Project screens read these to
   *  show who is on the way — the project member list carries only real
   *  memberships, so an assignee picker never sees a userless row. */
  project_grants: IProjectGrant[];
}

/** One recipient's outcome from a batch invite. Every submitted address gets
 *  exactly one — a partial failure must never hide the ones that were sent. */
export interface IRecipientResult {
  email: string;
  outcome: "sent" | "resent" | "already_member" | "already_invited" | "invalid" | "failed";
  detail: string;
  invitation_id: string;
  /** Only set when this request minted a token — the one moment the raw value
   *  is knowable, which is what makes "copy invite link" possible. */
  invite_url: string;
}

export interface IInviteBatchPayload {
  emails: string[];
  role: EWorkspaceRole;
  /** Applies to every recipient in the batch — inviting four people to one
   *  project is the point of a batch. Omit for a workspace-only invite. */
  project_grants?: IProjectGrant[];
}
