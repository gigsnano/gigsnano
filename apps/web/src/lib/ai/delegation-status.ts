import {
  EAgentConnectionStatus,
  EDelegationStatus,
  EDelegationUnit,
  type IDelegationEvent,
} from "@/types/ai/agent-delegation";

/** Elapsed-time thresholds (ms) for the mock/dev dispatch simulation. */
export const DELEGATION_STAGE_MS = {
  running: 1_500,
  awaiting_review: 4_000,
  completed: 6_000,
} as const;

/** Mock-only: map elapsed time since dispatch to a status. */
export function deriveMockDelegationStatus(elapsedMs: number): EDelegationStatus {
  if (elapsedMs >= DELEGATION_STAGE_MS.completed) return EDelegationStatus.Completed;
  if (elapsedMs >= DELEGATION_STAGE_MS.awaiting_review) return EDelegationStatus.AwaitingReview;
  if (elapsedMs >= DELEGATION_STAGE_MS.running) return EDelegationStatus.Running;
  return EDelegationStatus.Queued;
}

export function isTerminalDelegationStatus(status: EDelegationStatus): boolean {
  return (
    status === EDelegationStatus.Completed ||
    status === EDelegationStatus.Failed ||
    status === EDelegationStatus.Cancelled
  );
}

/** UI gate: may this connection be used to delegate this unit? */
export function canDelegate(input: {
  connectionStatus: EAgentConnectionStatus;
  unitType: EDelegationUnit;
  hasRepo: boolean;
}): { ok: boolean; reason?: string } {
  if (input.connectionStatus !== EAgentConnectionStatus.Connected) {
    return { ok: false, reason: "Reconnect this agent to delegate." };
  }
  if (input.unitType === EDelegationUnit.WorkItem && !input.hasRepo) {
    return { ok: false, reason: "Connect a repository to this project first." };
  }
  return { ok: true };
}

const VALID_STATUSES = new Set<string>(Object.values(EDelegationStatus));

/** Parse one SSE `data:` payload into a typed event, or null if malformed. */
export function parseDelegationEvent(raw: string): IDelegationEvent | null {
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    if (typeof obj.status !== "string" || !VALID_STATUSES.has(obj.status)) return null;
    return {
      status: obj.status as EDelegationStatus,
      message: typeof obj.message === "string" ? obj.message : "",
      at: typeof obj.at === "string" ? obj.at : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}
