/**
 * Approved shared-mailbox ingestion (GIN-458).
 *
 * V1 only ever ingests explicitly approved mailboxes and folders. Tenant-wide
 * and all-user grants are rejected outright, and a message outside an approved
 * folder is never persisted or indexed.
 */

export enum EMailboxScopeKind {
  /** A single shared mailbox. */
  Mailbox = "mailbox",
  /** A specific folder inside a shared mailbox. */
  Folder = "folder",
  /** Every mailbox in the tenant — refused in V1. */
  TenantWide = "tenant_wide",
  /** Every user's mailbox — refused in V1. */
  AllUsers = "all_users",
}

export enum EAttachmentPolicy {
  /** Attachments are ignored entirely. */
  Ignore = "ignore",
  /** Filename/size/type recorded; content is not stored. */
  MetadataOnly = "metadata_only",
  /** Attachment content is stored under the source's retention. */
  Store = "store",
}

/** One approved mailbox/folder a container may read. */
export interface IMailboxSource {
  id: string;
  connection_id: string;
  container_id: string;
  /** Provider tenant this source belongs to — half of the idempotency key. */
  provider_tenant: string;
  scope_kind: EMailboxScopeKind.Mailbox | EMailboxScopeKind.Folder;
  mailbox_id: string;
  /** Null when the whole mailbox is approved. */
  folder_id: string | null;
  /** Human-readable path shown in the UI, e.g. "Billing / Rejections". */
  folder_path: string;
  /** Why this source was approved — shown in audit and consent. */
  purpose: string;
  /** Workspace roles allowed to retrieve from this source. */
  allowed_roles: string[];
  retention_days: number | null;
  attachment_policy: EAttachmentPolicy;
  approved_by: string;
  approved_at: string;
}

export enum EMailboxChangeType {
  Created = "created",
  Updated = "updated",
  Deleted = "deleted",
  Moved = "moved",
}

/** Immutable identity of a provider message at a point in time. */
export interface IMailboxMessageRef {
  provider_tenant: string;
  /** Immutable provider message id. */
  message_id: string;
  /** Provider version/change key — increases on every edit. */
  version_id: string;
  mailbox_id: string;
  folder_id: string;
  received_at: string;
}

/** A change notification delivered by the provider. */
export interface IMailboxNotification {
  subscription_id: string;
  change_type: EMailboxChangeType;
  message: IMailboxMessageRef;
  /** Provider-supplied cursor for ordering and gap detection. */
  delta_cursor: string;
  /** Verified before the notification is trusted. */
  signature_valid: boolean;
}

/** The canonical stored record for one provider message. */
export interface IIngestedMessage {
  /** `${provider_tenant}:${message_id}` — one record per provider message. */
  key: string;
  source_id: string;
  provider_tenant: string;
  message_id: string;
  /** Highest version seen. Older notifications never overwrite it. */
  version_id: string;
  folder_id: string;
  received_at: string;
  /** False once deleted or moved out of an approved folder. */
  eligible_for_retrieval: boolean;
  updated_at: string;
}

export interface IMailboxSubscription {
  id: string;
  source_id: string;
  /** Provider subscription expiry — renewed before it lapses. */
  expires_at: string;
  /** Last cursor successfully processed; the recovery point after a gap. */
  delta_cursor: string | null;
  last_notification_at: string | null;
}

export interface IBackfillPlan {
  source_id: string;
  from: string;
  to: string;
  /** Provider-estimated message count for the range. */
  estimated_messages: number;
  /** Always true — a backfill never starts without explicit confirmation. */
  requires_confirmation: true;
  /** Set when the range exceeds the bounded-backfill limit. */
  too_large_reason: string | null;
}

export enum EDeadLetterReason {
  SignatureInvalid = "signature_invalid",
  SourceNotApproved = "source_not_approved",
  ProviderError = "provider_error",
  RateLimited = "rate_limited",
  ParseFailed = "parse_failed",
}

export interface IDeadLetterEntry {
  id: string;
  source_id: string | null;
  reason: EDeadLetterReason;
  /** Safe summary — never message bodies or provider payloads. */
  detail: string;
  message_key: string | null;
  occurred_at: string;
  attempts: number;
  /** False for reasons a retry can never fix. */
  reprocessable: boolean;
}
