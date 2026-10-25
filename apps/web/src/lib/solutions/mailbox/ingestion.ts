import {
  EDeadLetterReason,
  EMailboxChangeType,
  EMailboxScopeKind,
  type IBackfillPlan,
  type IDeadLetterEntry,
  type IIngestedMessage,
  type IMailboxMessageRef,
  type IMailboxNotification,
  type IMailboxSource,
  type IMailboxSubscription,
} from "@/types/solution/mailbox";

/**
 * Mailbox ingestion rules (GIN-458).
 *
 * Every function here is a gate between the provider and storage. The default
 * answer is "do not ingest" — a message is only persisted when it provably
 * belongs to an approved mailbox/folder for the right tenant.
 */

/** Longest initial backfill V1 will run without splitting it up. */
export const MAX_BACKFILL_DAYS = 90;
/** Renew a subscription this far ahead of expiry. */
export const SUBSCRIPTION_RENEW_LEAD_MS = 24 * 3_600_000;
/** Dead-letter attempts before an entry stops being retried automatically. */
export const MAX_DEAD_LETTER_ATTEMPTS = 5;

const V1_FORBIDDEN_SCOPES: ReadonlySet<EMailboxScopeKind> = new Set([
  EMailboxScopeKind.TenantWide,
  EMailboxScopeKind.AllUsers,
]);

/**
 * Refuse tenant-wide and all-user grants. Returns the refusal reason, or null
 * when the scope may be approved.
 */
export function scopeRejectionReason(scope: EMailboxScopeKind): string | null {
  if (!V1_FORBIDDEN_SCOPES.has(scope)) return null;
  return scope === EMailboxScopeKind.TenantWide
    ? "Tenant-wide mailbox access is not available. Approve specific shared mailboxes instead."
    : "All-user mailbox access is not available. Approve specific shared mailboxes instead.";
}

/** Only offer sources the authorized provider identity can actually grant. */
export function grantableSources<
  T extends { scope_kind: EMailboxScopeKind; grantable: boolean },
>(candidates: T[]): T[] {
  return candidates.filter(
    (candidate) => candidate.grantable && scopeRejectionReason(candidate.scope_kind) === null,
  );
}

/**
 * The approved source a message belongs to, or null. Tenant must match, and a
 * folder-scoped source only covers its own folder.
 */
export function matchApprovedSource(
  message: IMailboxMessageRef,
  sources: IMailboxSource[],
): IMailboxSource | null {
  return (
    sources.find((source) => {
      if (source.provider_tenant !== message.provider_tenant) return false;
      if (source.mailbox_id !== message.mailbox_id) return false;
      if (source.folder_id === null) return true;
      return source.folder_id === message.folder_id;
    }) ?? null
  );
}

export function canonicalKey(message: IMailboxMessageRef): string {
  return `${message.provider_tenant}:${message.message_id}`;
}

export interface IIngestDecision {
  /** The record to persist, or null when nothing should be written. */
  record: IIngestedMessage | null;
  /** Why the message was refused. Null when it was ingested. */
  rejected: EDeadLetterReason | null;
  /** True when an older or duplicate notification was ignored. */
  ignored_duplicate: boolean;
}

/**
 * Decide what a notification does to storage. Duplicate and out-of-order
 * notifications collapse onto one canonical record; only a newer version wins.
 */
export function ingestNotification(
  notification: IMailboxNotification,
  sources: IMailboxSource[],
  existing: IIngestedMessage | null,
  now: string = new Date().toISOString(),
): IIngestDecision {
  if (!notification.signature_valid) {
    return { record: null, rejected: EDeadLetterReason.SignatureInvalid, ignored_duplicate: false };
  }

  const { message, change_type } = notification;

  // A move out of every approved folder must still retract what we already
  // hold — but it can never create a record for an unapproved folder.
  const source = matchApprovedSource(message, sources);
  if (!source) {
    if (existing && change_type === EMailboxChangeType.Moved) {
      return {
        record: { ...existing, eligible_for_retrieval: false, folder_id: message.folder_id, updated_at: now },
        rejected: null,
        ignored_duplicate: false,
      };
    }
    return {
      record: null,
      rejected: EDeadLetterReason.SourceNotApproved,
      ignored_duplicate: false,
    };
  }

  if (existing && message.version_id <= existing.version_id) {
    return { record: existing, rejected: null, ignored_duplicate: true };
  }

  const deleted = change_type === EMailboxChangeType.Deleted;

  return {
    record: {
      key: canonicalKey(message),
      source_id: source.id,
      provider_tenant: message.provider_tenant,
      message_id: message.message_id,
      version_id: message.version_id,
      folder_id: message.folder_id,
      received_at: message.received_at,
      eligible_for_retrieval: !deleted,
      updated_at: now,
    },
    rejected: null,
    ignored_duplicate: false,
  };
}

function dayDiff(from: string, to: string): number {
  return (new Date(to).getTime() - new Date(from).getTime()) / 86_400_000;
}

/** Plan a bounded initial backfill. Always requires explicit confirmation. */
export function planBackfill(
  sourceId: string,
  from: string,
  to: string,
  estimatedMessages: number,
): IBackfillPlan {
  const days = dayDiff(from, to);
  return {
    source_id: sourceId,
    from,
    to,
    estimated_messages: estimatedMessages,
    requires_confirmation: true,
    too_large_reason:
      days > MAX_BACKFILL_DAYS
        ? `That range covers ${Math.round(days)} days. Backfill up to ${MAX_BACKFILL_DAYS} days at a time.`
        : null,
  };
}

export function backfillAllowed(plan: IBackfillPlan, confirmed: boolean): boolean {
  return confirmed && plan.too_large_reason === null;
}

export function shouldRenewSubscription(
  subscription: IMailboxSubscription,
  now: Date = new Date(),
): boolean {
  return new Date(subscription.expires_at).getTime() - now.getTime() <= SUBSCRIPTION_RENEW_LEAD_MS;
}

/**
 * A notification whose cursor does not follow the last processed one means the
 * stream skipped ahead — recover from the stored cursor rather than trusting it.
 */
export function detectCursorGap(
  subscription: IMailboxSubscription,
  notification: IMailboxNotification,
): { gap: boolean; recover_from: string | null } {
  if (!subscription.delta_cursor) return { gap: false, recover_from: null };
  if (notification.delta_cursor <= subscription.delta_cursor) {
    return { gap: false, recover_from: null };
  }
  const contiguous = notification.delta_cursor === nextCursor(subscription.delta_cursor);
  return contiguous
    ? { gap: false, recover_from: null }
    : { gap: true, recover_from: subscription.delta_cursor };
}

/** Cursors are opaque but monotonic; the mock provider uses a numeric suffix. */
function nextCursor(cursor: string): string {
  const match = /^(.*?)(\d+)$/.exec(cursor);
  if (!match) return cursor;
  return `${match[1]}${Number(match[2]) + 1}`;
}

export function advanceCursor(
  subscription: IMailboxSubscription,
  notification: IMailboxNotification,
  now: string = new Date().toISOString(),
): IMailboxSubscription {
  if (subscription.delta_cursor && notification.delta_cursor <= subscription.delta_cursor) {
    return subscription;
  }
  return {
    ...subscription,
    delta_cursor: notification.delta_cursor,
    last_notification_at: now,
  };
}

const PERMANENT_FAILURES: ReadonlySet<EDeadLetterReason> = new Set([
  EDeadLetterReason.SignatureInvalid,
  EDeadLetterReason.SourceNotApproved,
]);

export function toDeadLetter(
  id: string,
  reason: EDeadLetterReason,
  detail: string,
  options: { sourceId?: string | null; messageKey?: string | null; attempts?: number } = {},
): IDeadLetterEntry {
  return {
    id,
    source_id: options.sourceId ?? null,
    reason,
    detail,
    message_key: options.messageKey ?? null,
    occurred_at: new Date().toISOString(),
    attempts: options.attempts ?? 1,
    reprocessable: !PERMANENT_FAILURES.has(reason),
  };
}

/** Reprocessing is offered only for transient failures under the attempt cap. */
export function canReprocess(entry: IDeadLetterEntry): boolean {
  return entry.reprocessable && entry.attempts < MAX_DEAD_LETTER_ATTEMPTS;
}

/** Retrieval is gated on eligibility, the caller's role and retention. */
export function canRetrieveMessage(
  record: IIngestedMessage,
  source: IMailboxSource,
  callerRoles: string[],
  now: Date = new Date(),
): boolean {
  if (!record.eligible_for_retrieval) return false;
  if (source.id !== record.source_id) return false;
  if (!source.allowed_roles.some((role) => callerRoles.includes(role))) return false;
  if (source.retention_days !== null) {
    const age = (now.getTime() - new Date(record.received_at).getTime()) / 86_400_000;
    if (age > source.retention_days) return false;
  }
  return true;
}
