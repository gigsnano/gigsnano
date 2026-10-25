import { APIError } from "@/services/api-error";
import type { IAuthUser } from "@/types";
import {
  EAgentConnectionStatus,
  EAgentProvider,
  EDelegationStatus,
  EDelegationUnit,
  type IAgentConnection,
  type ICreateDelegationPayload,
  type IDelegation,
} from "@/types/ai/agent-delegation";
import {
  deriveMockDelegationStatus,
  isTerminalDelegationStatus,
} from "@/lib/ai/delegation-status";

import {
  PROVIDER_LABEL,
  mockConnections,
  mockDelegations,
  nextConnectionId,
  nextDelegationId,
} from "../data/agent-delegation";

type Handler = {
  method: string;
  pattern: RegExp;
  resolve: (match: RegExpMatchArray, body: unknown) => unknown;
};

const clone = <T>(value: T): T => structuredClone(value);
const notFound = (what: string): never => {
  throw new APIError(404, `${what} not found`);
};

const VALID_PROVIDERS = new Set<string>(Object.values(EAgentProvider));

/** Compute + persist the current status/result of a delegation from elapsed time. */
function advance(d: IDelegation): IDelegation {
  if (isTerminalDelegationStatus(d.status)) return d;
  const elapsed = Date.now() - new Date(d.created_at).getTime();
  const status = deriveMockDelegationStatus(elapsed);
  if (status !== d.status) {
    d.status = status;
    d.updated_at = new Date().toISOString();
    if (status === EDelegationStatus.Completed) {
      d.result =
        d.unit_type === EDelegationUnit.WorkItem
          ? {
              kind: "pr",
              pr_url: `https://github.com/acme/repo/pull/${d.id}`,
              branch: `agent/${d.id}`,
            }
          : { kind: "document", document_id: `doc_agent_${d.id}`, summary: "Draft ready for review." };
    }
  }
  return d;
}

export function makeAgentDelegationHandlers(getUser: () => IAuthUser | null): Handler[] {
  const requireUser = (): IAuthUser => {
    const u = getUser();
    if (!u) throw new APIError(401, "Not authenticated");
    return u;
  };

  return [
    {
      method: "GET",
      pattern: /^\/agents\/connections\/$/,
      resolve: () => {
        const u = requireUser();
        return clone(mockConnections.filter((c) => c.user_id === u.id));
      },
    },
    {
      method: "POST",
      pattern: /^\/agents\/connections\/cursor\/connect\/$/,
      resolve: (_, body) => {
        const u = requireUser();
        const b = body as { api_key?: string };
        const key = (b.api_key ?? "").trim();
        if (!key) throw new APIError(400, "API key is required");
        const existing = mockConnections.find(
          (c) => c.user_id === u.id && c.provider === EAgentProvider.Cursor,
        );
        if (existing) {
          existing.status = EAgentConnectionStatus.Connected;
          existing.connected_at = new Date().toISOString();
          return clone(existing);
        }
        const created: IAgentConnection = {
          id: nextConnectionId(),
          user_id: u.id,
          provider: EAgentProvider.Cursor,
          account_label: `cursor: ${u.email}`,
          status: EAgentConnectionStatus.Connected,
          connected_at: new Date().toISOString(),
        };
        mockConnections.push(created);
        return clone(created);
      },
    },
    {
      method: "POST",
      pattern: /^\/agents\/connections\/claude\/connect\/$/,
      resolve: (_, body) => {
        const u = requireUser();
        const b = body as { api_key?: string };
        const key = (b.api_key ?? "").trim();
        if (!key) throw new APIError(400, "API key is required");
        const existing = mockConnections.find(
          (c) => c.user_id === u.id && c.provider === EAgentProvider.ClaudeCode,
        );
        if (existing) {
          existing.status = EAgentConnectionStatus.Connected;
          existing.connected_at = new Date().toISOString();
          return clone(existing);
        }
        const created: IAgentConnection = {
          id: nextConnectionId(),
          user_id: u.id,
          provider: EAgentProvider.ClaudeCode,
          account_label: `claude: ${u.email}`,
          status: EAgentConnectionStatus.Connected,
          connected_at: new Date().toISOString(),
        };
        mockConnections.push(created);
        return clone(created);
      },
    },
    {
      method: "POST",
      pattern: /^\/agents\/connections\/([^/]+)\/install-url\/$/,
      resolve: ([, provider]) => {
        const u = requireUser();
        if (!VALID_PROVIDERS.has(provider)) throw new APIError(400, "Unknown provider");
        if (provider === EAgentProvider.Cursor) {
          throw new APIError(400, "Cursor connects with an API key");
        }
        const p = provider as EAgentProvider;
        const state = encodeURIComponent(`mock:${p}:${u.id}`);
        return { url: `/account/settings/agents/callback?code=dev&state=${state}` };
      },
    },
    {
      method: "POST",
      pattern: /^\/agents\/oauth\/callback\/$/,
      resolve: (_, body) => {
        const u = requireUser();
        const b = body as { code: string; state: string };
        const parts = decodeURIComponent(b.state).split(":");
        const p = (parts[1] ?? "cursor") as EAgentProvider;
        if (!VALID_PROVIDERS.has(p)) throw new APIError(400, "Unknown provider");
        const existing = mockConnections.find((c) => c.user_id === u.id && c.provider === p);
        if (existing) {
          existing.status = EAgentConnectionStatus.Connected;
          existing.connected_at = new Date().toISOString();
          return clone(existing);
        }
        const created: IAgentConnection = {
          id: nextConnectionId(),
          user_id: u.id,
          provider: p,
          account_label: `${PROVIDER_LABEL[p].toLowerCase()}: ${u.email}`,
          status: EAgentConnectionStatus.Connected,
          connected_at: new Date().toISOString(),
        };
        mockConnections.push(created);
        return clone(created);
      },
    },
    {
      method: "DELETE",
      pattern: /^\/agents\/connections\/([^/]+)\/$/,
      resolve: ([, id]) => {
        const u = requireUser();
        const i = mockConnections.findIndex((c) => c.id === id && c.user_id === u.id);
        if (i === -1) return notFound(`Connection "${id}"`);
        mockConnections.splice(i, 1);
        return { success: true };
      },
    },
    {
      method: "POST",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/stories\/([^/]+)\/delegations\/$/,
      resolve: ([, slug, projectId, storyId], body) => {
        const u = requireUser();
        const b = body as ICreateDelegationPayload;
        const conn = mockConnections.find((c) => c.id === b.connection_id && c.user_id === u.id);
        if (!conn) return notFound(`Connection "${b.connection_id}"`);
        if (conn.status !== EAgentConnectionStatus.Connected) {
          throw new APIError(409, "Agent connection is not active");
        }
        const now = new Date().toISOString();
        const created: IDelegation = {
          id: nextDelegationId(),
          unit_type: b.unit_type,
          unit_id: storyId,
          workspace_slug: slug,
          project_id: projectId,
          provider: conn.provider,
          connection_id: conn.id,
          delegated_by: u.id,
          status: EDelegationStatus.Queued,
          custom_prompt: b.custom_prompt?.trim() || null,
          result: null,
          error: null,
          created_at: now,
          updated_at: now,
        };
        mockDelegations.push(created);
        return clone(created);
      },
    },
    {
      // "Accept & run" (GIN-342): dev returns a queued delegation like /delegations/,
      // wrapped in the LaunchOut shape. ponytail: the mock skips the profile
      // preflight (agent/required are stubbed) — the widget only needs delegation.id.
      method: "POST",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/stories\/([^/]+)\/launch\/$/,
      resolve: ([, slug, projectId, storyId], body) => {
        const u = requireUser();
        const b = body as { connection_id: string };
        const conn = mockConnections.find((c) => c.id === b.connection_id && c.user_id === u.id);
        if (!conn) return notFound(`Connection "${b.connection_id}"`);
        if (conn.status !== EAgentConnectionStatus.Connected) {
          throw new APIError(409, "Agent connection is not active");
        }
        const now = new Date().toISOString();
        const delegation: IDelegation = {
          id: nextDelegationId(),
          unit_type: EDelegationUnit.WorkItem,
          unit_id: storyId,
          workspace_slug: slug,
          project_id: projectId,
          provider: conn.provider,
          connection_id: conn.id,
          delegated_by: u.id,
          status: EDelegationStatus.Queued,
          custom_prompt: "# Active skills for this run\n…",
          result: null,
          error: null,
          created_at: now,
          updated_at: now,
        };
        mockDelegations.push(delegation);
        return { run_id: `run_${delegation.id}`, agent: "claude-code", required: [], delegation: clone(delegation) };
      },
    },
    {
      method: "GET",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/delegations\/([^/]+)\/$/,
      resolve: ([, , , id]) => {
        const d = mockDelegations.find((x) => x.id === id);
        if (!d) return notFound(`Delegation "${id}"`);
        return clone(advance(d));
      },
    },
    {
      method: "POST",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/delegations\/([^/]+)\/cancel\/$/,
      resolve: ([, , , id]) => {
        const u = requireUser();
        const d = mockDelegations.find((x) => x.id === id);
        if (!d) return notFound(`Delegation "${id}"`);
        if (d.delegated_by !== u.id) throw new APIError(403, "Not your delegation");
        if (isTerminalDelegationStatus(d.status)) throw new APIError(409, "Already finished");
        d.status = EDelegationStatus.Cancelled;
        d.updated_at = new Date().toISOString();
        return clone(d);
      },
    },
    {
      method: "POST",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/delegations\/([^/]+)\/retry\/$/,
      resolve: ([, , , id]) => {
        const u = requireUser();
        const d = mockDelegations.find((x) => x.id === id);
        if (!d) return notFound(`Delegation "${id}"`);
        if (d.delegated_by !== u.id) throw new APIError(403, "Not your delegation");
        const now = new Date().toISOString();
        d.status = EDelegationStatus.Queued;
        d.result = null;
        d.error = null;
        d.created_at = now;
        d.updated_at = now;
        return clone(d);
      },
    },
  ];
}
