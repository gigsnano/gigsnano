import { describe, expect, it } from "vitest";

import { APIError } from "@/services/api-error";

import { invitationFailure } from "./invitation-failure";

const err = (status: number, detail?: string) =>
  new APIError(status, detail ?? "", detail ? { detail } : null);

describe("invitationFailure", () => {
  it("tells a signed-out invitee to make an account rather than calling the link dead", () => {
    // The reported bug: no session → 401 → the page said "expired or not valid"
    // about an invitation that was perfectly good.
    const f = invitationFailure(err(401, "Not authenticated"));
    expect(f.kind).toBe("signed-out");
    expect(f.title).not.toMatch(/expired|invalid/i);
  });

  it("keeps the wrong-account case recoverable", () => {
    expect(invitationFailure(err(403, "sent to a different email")).kind).toBe("wrong-account");
  });

  it("reports a genuine expiry only on 410", () => {
    const f = invitationFailure(err(410, "This invitation has expired. Ask for a new one."));
    expect(f.kind).toBe("expired");
    expect(f.description).toMatch(/expired/i);
  });

  it("distinguishes a spent or revoked invitation from an expired one", () => {
    const f = invitationFailure(err(409, "This invitation is no longer valid."));
    expect(f.kind).toBe("settled");
    expect(f.title).not.toMatch(/expired/i);
  });

  it("calls an unknown token invalid, not expired", () => {
    expect(invitationFailure(err(404)).kind).toBe("invalid");
  });

  it("does not blame the invitation for a network failure", () => {
    expect(invitationFailure(new Error("offline")).kind).toBe("unknown");
  });

  it("prefers the backend's own wording when it sent one", () => {
    expect(invitationFailure(err(410, "Ask Ada for a fresh link.")).description).toBe(
      "Ask Ada for a fresh link.",
    );
  });
});
