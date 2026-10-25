import {
  EAgentConnectionStatus,
  EAgentProvider,
  type IAgentConnection,
  type IDelegation,
} from "@/types/ai/agent-delegation";

export const PROVIDER_LABEL: Record<EAgentProvider, string> = {
  [EAgentProvider.Cursor]: "Cursor",
  [EAgentProvider.Codex]: "Codex",
  [EAgentProvider.ClaudeCode]: "Claude Code",
};

/** Seeded so the panel isn't empty for the mock current user (u_1 / Ada). */
export const mockConnections: IAgentConnection[] = [
  {
    id: "agc_1",
    user_id: "u_1",
    provider: EAgentProvider.Cursor,
    account_label: "cursor: ada@acme.test",
    status: EAgentConnectionStatus.Connected,
    connected_at: "2026-07-01T00:00:00Z",
  },
];

export const mockDelegations: IDelegation[] = [];

let connSeq = mockConnections.length;
let delSeq = mockDelegations.length;

export function nextConnectionId() {
  return `agc_${++connSeq}`;
}
export function nextDelegationId() {
  return `del_${++delSeq}`;
}
