import { describe, expect, it } from "vitest";

import {
  EAttachmentPolicy,
  EDeadLetterReason,
  EMailboxChangeType,
  EMailboxScopeKind,
  type IIngestedMessage,
  type IMailboxMessageRef,
  type IMailboxNotification,
  type IMailboxSource,
  type IMailboxSubscription,
} from "@/types/solution/mailbox";

import {
  advanceCursor,
  backfillAllowed,
  canReprocess,
  canRetrieveMessage,
  detectCursorGap,
  grantableSources,
  ingestNotification,
  matchApprovedSource,
  planBackfill,
  scopeRejectionReason,
  shouldRenewSubscription,
  toDeadLetter,
} from "./index";

const NOW = new Date("2026-07-26T12:00:00.000Z");

function source(overrides: Partial<IMailboxSource> = {}): IMailboxSource {
  return {
    id: "src-1",
    connection_id: "conn-1",
    container_id: "proj-1",
    provider_tenant: "acme",
    scope_kind: EMailboxScopeKind.Folder,
    mailbox_id: "billing@acme.com",
    folder_id: "rejections",
    folder_path: "Billing / Rejections",
    purpose: "Rejection correspondence for revenue assurance.",
    allowed_roles: ["admin", "assurance"],
    retention_days: 365,
    attachment_policy: EAttachmentPolicy.MetadataOnly,
    approved_by: "user-1",
    approved_at: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

function messageRef(overrides: Partial<IMailboxMessageRef> = {}): IMailboxMessageRef {
  return {
    provider_tenant: "acme",
    message_id: "msg-1",
    version_id: "v2",
    mailbox_id: "billing@acme.com",
    folder_id: "rejections",
    received_at: "2026-07-20T09:00:00.000Z",
    ...overrides,
  };
}

function notification(overrides: Partial<IMailboxNotification> = {}): IMailboxNotification {
  return {
    subscription_id: "sub-1",
    change_type: EMailboxChangeType.Created,
    message: messageRef(),
    delta_cursor: "cur-5",
    signature_valid: true,
    ...overrides,
  };
}

function stored(overrides: Partial<IIngestedMessage> = {}): IIngestedMessage {
  return {
    key: "acme:msg-1",
    source_id: "src-1",
    provider_tenant: "acme",
    message_id: "msg-1",
    version_id: "v2",
    folder_id: "rejections",
    received_at: "2026-07-20T09:00:00.000Z",
    eligible_for_retrieval: true,
    updated_at: "2026-07-20T09:00:00.000Z",
    ...overrides,
  };
}

describe("scope approval", () => {
  it("refuses tenant-wide and all-user scopes in V1", () => {
    expect(scopeRejectionReason(EMailboxScopeKind.TenantWide)).toMatch(/not available/);
    expect(scopeRejectionReason(EMailboxScopeKind.AllUsers)).toMatch(/not available/);
  });

  it("allows a specific mailbox or folder", () => {
    expect(scopeRejectionReason(EMailboxScopeKind.Mailbox)).toBeNull();
    expect(scopeRejectionReason(EMailboxScopeKind.Folder)).toBeNull();
  });

  it("offers only sources the provider identity may actually grant", () => {
    const offered = grantableSources([
      { scope_kind: EMailboxScopeKind.Folder, grantable: true, id: "ok" },
      { scope_kind: EMailboxScopeKind.Folder, grantable: false, id: "no-permission" },
      { scope_kind: EMailboxScopeKind.TenantWide, grantable: true, id: "too-broad" },
    ]);

    expect(offered.map((o) => o.id)).toEqual(["ok"]);
  });
});

describe("matchApprovedSource", () => {
  it("matches a folder-scoped source only for its own folder", () => {
    expect(matchApprovedSource(messageRef(), [source()])).not.toBeNull();
    expect(matchApprovedSource(messageRef({ folder_id: "inbox" }), [source()])).toBeNull();
  });

  it("matches every folder when the whole mailbox is approved", () => {
    const whole = source({ scope_kind: EMailboxScopeKind.Mailbox, folder_id: null });

    expect(matchApprovedSource(messageRef({ folder_id: "anything" }), [whole])).not.toBeNull();
  });

  it("never matches across provider tenants", () => {
    expect(matchApprovedSource(messageRef({ provider_tenant: "other" }), [source()])).toBeNull();
  });
});

describe("ingestNotification", () => {
  it("persists a message from an approved folder", () => {
    const decision = ingestNotification(notification(), [source()], null, NOW.toISOString());

    expect(decision.record?.key).toBe("acme:msg-1");
    expect(decision.record?.eligible_for_retrieval).toBe(true);
    expect(decision.rejected).toBeNull();
  });

  it("never persists a message outside an approved folder", () => {
    const decision = ingestNotification(
      notification({ message: messageRef({ folder_id: "personal" }) }),
      [source()],
      null,
      NOW.toISOString(),
    );

    expect(decision.record).toBeNull();
    expect(decision.rejected).toBe(EDeadLetterReason.SourceNotApproved);
  });

  it("refuses an unverified callback", () => {
    const decision = ingestNotification(
      notification({ signature_valid: false }),
      [source()],
      null,
      NOW.toISOString(),
    );

    expect(decision.record).toBeNull();
    expect(decision.rejected).toBe(EDeadLetterReason.SignatureInvalid);
  });

  it("collapses a duplicate notification onto the one canonical record", () => {
    const existing = stored();
    const decision = ingestNotification(notification(), [source()], existing, NOW.toISOString());

    expect(decision.ignored_duplicate).toBe(true);
    expect(decision.record).toBe(existing);
  });

  it("ignores an out-of-order older version", () => {
    const existing = stored({ version_id: "v3" });
    const decision = ingestNotification(
      notification({ message: messageRef({ version_id: "v2" }) }),
      [source()],
      existing,
      NOW.toISOString(),
    );

    expect(decision.ignored_duplicate).toBe(true);
    expect(decision.record?.version_id).toBe("v3");
  });

  it("applies a newer edit to the canonical record", () => {
    const decision = ingestNotification(
      notification({
        change_type: EMailboxChangeType.Updated,
        message: messageRef({ version_id: "v3" }),
      }),
      [source()],
      stored(),
      NOW.toISOString(),
    );

    expect(decision.record?.version_id).toBe("v3");
    expect(decision.ignored_duplicate).toBe(false);
  });

  it("makes a deleted message ineligible for retrieval", () => {
    const decision = ingestNotification(
      notification({
        change_type: EMailboxChangeType.Deleted,
        message: messageRef({ version_id: "v3" }),
      }),
      [source()],
      stored(),
      NOW.toISOString(),
    );

    expect(decision.record?.eligible_for_retrieval).toBe(false);
  });

  it("retracts a message moved out of every approved folder", () => {
    const decision = ingestNotification(
      notification({
        change_type: EMailboxChangeType.Moved,
        message: messageRef({ folder_id: "archive", version_id: "v3" }),
      }),
      [source()],
      stored(),
      NOW.toISOString(),
    );

    expect(decision.record?.eligible_for_retrieval).toBe(false);
    expect(decision.record?.folder_id).toBe("archive");
    expect(decision.rejected).toBeNull();
  });

  it("does not create a record for a move into an unapproved folder", () => {
    const decision = ingestNotification(
      notification({
        change_type: EMailboxChangeType.Moved,
        message: messageRef({ folder_id: "archive" }),
      }),
      [source()],
      null,
      NOW.toISOString(),
    );

    expect(decision.record).toBeNull();
    expect(decision.rejected).toBe(EDeadLetterReason.SourceNotApproved);
  });

  it("keeps a message moved between two approved folders eligible", () => {
    const both = [source(), source({ id: "src-2", folder_id: "archive" })];
    const decision = ingestNotification(
      notification({
        change_type: EMailboxChangeType.Moved,
        message: messageRef({ folder_id: "archive", version_id: "v3" }),
      }),
      both,
      stored(),
      NOW.toISOString(),
    );

    expect(decision.record?.eligible_for_retrieval).toBe(true);
    expect(decision.record?.source_id).toBe("src-2");
  });
});

describe("backfill", () => {
  it("always requires confirmation and reports the estimated volume", () => {
    const plan = planBackfill("src-1", "2026-06-01T00:00:00.000Z", "2026-07-01T00:00:00.000Z", 1240);

    expect(plan.requires_confirmation).toBe(true);
    expect(plan.estimated_messages).toBe(1240);
    expect(plan.too_large_reason).toBeNull();
    expect(backfillAllowed(plan, true)).toBe(true);
  });

  it("does not start without confirmation", () => {
    const plan = planBackfill("src-1", "2026-06-01T00:00:00.000Z", "2026-07-01T00:00:00.000Z", 10);

    expect(backfillAllowed(plan, false)).toBe(false);
  });

  it("bounds the range and refuses an oversized backfill", () => {
    const plan = planBackfill("src-1", "2024-01-01T00:00:00.000Z", "2026-07-01T00:00:00.000Z", 90000);

    expect(plan.too_large_reason).toMatch(/90 days at a time/);
    expect(backfillAllowed(plan, true)).toBe(false);
  });
});

describe("subscriptions and recovery", () => {
  function subscription(overrides: Partial<IMailboxSubscription> = {}): IMailboxSubscription {
    return {
      id: "sub-1",
      source_id: "src-1",
      expires_at: "2026-07-29T12:00:00.000Z",
      delta_cursor: "cur-4",
      last_notification_at: null,
      ...overrides,
    };
  }

  it("renews only inside the lead window", () => {
    expect(shouldRenewSubscription(subscription(), NOW)).toBe(false);
    expect(
      shouldRenewSubscription(subscription({ expires_at: "2026-07-27T00:00:00.000Z" }), NOW),
    ).toBe(true);
  });

  it("accepts a contiguous cursor without flagging a gap", () => {
    expect(detectCursorGap(subscription(), notification({ delta_cursor: "cur-5" }))).toEqual({
      gap: false,
      recover_from: null,
    });
  });

  it("flags a skipped cursor and names the recovery point", () => {
    expect(detectCursorGap(subscription(), notification({ delta_cursor: "cur-9" }))).toEqual({
      gap: true,
      recover_from: "cur-4",
    });
  });

  it("treats a replayed cursor as already processed", () => {
    expect(detectCursorGap(subscription(), notification({ delta_cursor: "cur-2" }))).toEqual({
      gap: false,
      recover_from: null,
    });
  });

  it("never rewinds the stored cursor on replay", () => {
    const advanced = advanceCursor(
      subscription(),
      notification({ delta_cursor: "cur-2" }),
      NOW.toISOString(),
    );

    expect(advanced.delta_cursor).toBe("cur-4");
  });

  it("advances the cursor on a newer notification", () => {
    const advanced = advanceCursor(
      subscription(),
      notification({ delta_cursor: "cur-5" }),
      NOW.toISOString(),
    );

    expect(advanced.delta_cursor).toBe("cur-5");
    expect(advanced.last_notification_at).toBe(NOW.toISOString());
  });
});

describe("dead letters", () => {
  it("marks rate limiting as reprocessable", () => {
    const entry = toDeadLetter("dl-1", EDeadLetterReason.RateLimited, "Provider throttled.");

    expect(entry.reprocessable).toBe(true);
    expect(canReprocess(entry)).toBe(true);
  });

  it("never offers reprocessing for an unapproved source or bad signature", () => {
    expect(canReprocess(toDeadLetter("dl-2", EDeadLetterReason.SourceNotApproved, "x"))).toBe(
      false,
    );
    expect(canReprocess(toDeadLetter("dl-3", EDeadLetterReason.SignatureInvalid, "x"))).toBe(
      false,
    );
  });

  it("stops retrying past the attempt cap", () => {
    const entry = toDeadLetter("dl-4", EDeadLetterReason.ProviderError, "500", { attempts: 5 });

    expect(canReprocess(entry)).toBe(false);
  });
});

describe("canRetrieveMessage", () => {
  it("allows an eligible message for an allowed role", () => {
    expect(canRetrieveMessage(stored(), source(), ["assurance"], NOW)).toBe(true);
  });

  it("denies a role that was not approved for the source", () => {
    expect(canRetrieveMessage(stored(), source(), ["viewer"], NOW)).toBe(false);
  });

  it("denies a deleted or moved-out message immediately", () => {
    expect(
      canRetrieveMessage(stored({ eligible_for_retrieval: false }), source(), ["admin"], NOW),
    ).toBe(false);
  });

  it("denies a message past its retention window", () => {
    expect(
      canRetrieveMessage(
        stored({ received_at: "2024-01-01T00:00:00.000Z" }),
        source(),
        ["admin"],
        NOW,
      ),
    ).toBe(false);
  });
});
