import { describe, expect, it } from "vitest";

import {
  EAgentConnectionStatus,
  EDelegationStatus,
  EDelegationUnit,
} from "@/types/ai/agent-delegation";
import {
  DELEGATION_STAGE_MS,
  canDelegate,
  deriveMockDelegationStatus,
  isTerminalDelegationStatus,
  parseDelegationEvent,
} from "./delegation-status";

describe("deriveMockDelegationStatus", () => {
  it("advances queued → running → awaiting_review → completed by elapsed time", () => {
    expect(deriveMockDelegationStatus(0)).toBe(EDelegationStatus.Queued);
    expect(deriveMockDelegationStatus(DELEGATION_STAGE_MS.running)).toBe(EDelegationStatus.Running);
    expect(deriveMockDelegationStatus(DELEGATION_STAGE_MS.awaiting_review)).toBe(
      EDelegationStatus.AwaitingReview,
    );
    expect(deriveMockDelegationStatus(DELEGATION_STAGE_MS.completed)).toBe(
      EDelegationStatus.Completed,
    );
    expect(deriveMockDelegationStatus(DELEGATION_STAGE_MS.completed + 10_000)).toBe(
      EDelegationStatus.Completed,
    );
  });
});

describe("isTerminalDelegationStatus", () => {
  it("is true for completed/failed/cancelled only", () => {
    expect(isTerminalDelegationStatus(EDelegationStatus.Completed)).toBe(true);
    expect(isTerminalDelegationStatus(EDelegationStatus.Failed)).toBe(true);
    expect(isTerminalDelegationStatus(EDelegationStatus.Cancelled)).toBe(true);
    expect(isTerminalDelegationStatus(EDelegationStatus.Queued)).toBe(false);
    expect(isTerminalDelegationStatus(EDelegationStatus.AwaitingReview)).toBe(false);
  });
});

describe("canDelegate", () => {
  it("blocks a non-connected connection", () => {
    const r = canDelegate({
      connectionStatus: EAgentConnectionStatus.Expired,
      unitType: EDelegationUnit.WorkItem,
      hasRepo: true,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/reconnect/i);
  });

  it("blocks a work item with no repo, but allows a BMAD card without one", () => {
    expect(
      canDelegate({
        connectionStatus: EAgentConnectionStatus.Connected,
        unitType: EDelegationUnit.WorkItem,
        hasRepo: false,
      }).ok,
    ).toBe(false);
    expect(
      canDelegate({
        connectionStatus: EAgentConnectionStatus.Connected,
        unitType: EDelegationUnit.BmadCard,
        hasRepo: false,
      }).ok,
    ).toBe(true);
  });

  it("allows a connected agent on a work item with a repo", () => {
    expect(
      canDelegate({
        connectionStatus: EAgentConnectionStatus.Connected,
        unitType: EDelegationUnit.WorkItem,
        hasRepo: true,
      }).ok,
    ).toBe(true);
  });
});

describe("parseDelegationEvent", () => {
  it("parses a valid SSE data frame", () => {
    const ev = parseDelegationEvent(
      JSON.stringify({ status: "running", message: "branch created", at: "2026-07-05T00:00:00Z" }),
    );
    expect(ev?.status).toBe(EDelegationStatus.Running);
    expect(ev?.message).toBe("branch created");
  });

  it("returns null on malformed input", () => {
    expect(parseDelegationEvent("not json")).toBeNull();
    expect(parseDelegationEvent(JSON.stringify({ status: "bogus" }))).toBeNull();
  });
});
