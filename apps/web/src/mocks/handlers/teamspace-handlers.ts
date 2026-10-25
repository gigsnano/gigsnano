import { APIError } from "@/services/api-error";
import { EStoryStatus } from "@/types";

import { projects } from "../data/projects";
import { allStories } from "../data/stories";
import { rosterArtifacts, teamspaces, type IMockTeamspace } from "../data/teamspaces";

type Handler = {
  method: string;
  pattern: RegExp;
  resolve: (match: RegExpMatchArray, body: unknown) => unknown;
};

const clone = <T>(value: T): T => structuredClone(value);

// Static hybrid roster load (mirrors the agent_resources shape). ponytail: fixed.
const AGENT_WORKLOAD = [
  { id: "agent_dev", name: "James (Developer)", persona: "Developer", phase: "dev", skills: [], capacity: 3, active_load: 2, cost_tokens: 18400, cost_usd: 0.21 },
  { id: "agent_qa", name: "Quinn (QA)", persona: "Test", phase: "qa", skills: [], capacity: 3, active_load: 0, cost_tokens: 0, cost_usd: 0 },
  { id: "agent_ux", name: "Sally (UX)", persona: "UX", phase: "design", skills: [], capacity: 2, active_load: 1, cost_tokens: 6100, cost_usd: 0.07 },
];

let tsSeq = teamspaces.length;

function find(slug: string, id: string): IMockTeamspace {
  const t = teamspaces.find((x) => x.workspace_slug === slug && x.id === id);
  if (!t) throw new APIError(404, "Teamspace not found");
  return t;
}

function rollup(projectIds: string[]) {
  const scoped = allStories.filter((s) => projectIds.includes(s.project_id));
  const total = scoped.length;
  const done = scoped.filter((s) => s.status === EStoryStatus.Done).length;
  return { total, done, progress_pct: total ? Math.round((done / total) * 100) : 0 };
}

function humanWorkload(projectIds: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of allStories) {
    if (!projectIds.includes(s.project_id) || s.status === EStoryStatus.Done) continue;
    const key = s.assignee_id ?? "unassigned";
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

export function makeTeamspaceHandlers(): Handler[] {
  return [
    {
      method: "GET",
      pattern: /^\/workspaces\/([^/]+)\/teamspaces\/$/,
      resolve: ([, slug]) =>
        clone(
          teamspaces
            .filter((t) => t.workspace_slug === slug)
            .sort((a, b) => a.name.localeCompare(b.name)),
        ),
    },
    {
      method: "POST",
      pattern: /^\/workspaces\/([^/]+)\/teamspaces\/$/,
      resolve: ([, slug], body) => {
        const b = (body ?? {}) as {
          name?: string;
          description?: string;
          pinned_artifacts?: string[];
          member_ids?: string[];
          project_ids?: string[];
        };
        if (!b.name?.trim()) throw new APIError(400, "A name is required");
        const created: IMockTeamspace = {
          id: `ts_${++tsSeq}`,
          workspace_slug: slug,
          workspace_id: "ws_1",
          name: b.name.trim(),
          description: b.description ?? "",
          pinned_artifacts: b.pinned_artifacts ?? [],
          member_ids: b.member_ids ?? [],
          project_ids: b.project_ids ?? [],
          created_at: new Date().toISOString(),
        };
        teamspaces.push(created);
        return clone(created);
      },
    },
    {
      method: "PATCH",
      pattern: /^\/workspaces\/([^/]+)\/teamspaces\/([^/]+)\/$/,
      resolve: ([, slug, id], body) => {
        const t = find(slug, id);
        const b = (body ?? {}) as { name?: string; description?: string; pinned_artifacts?: string[] };
        if (b.name !== undefined) t.name = b.name.trim();
        if (b.description !== undefined) t.description = b.description;
        if (b.pinned_artifacts !== undefined) t.pinned_artifacts = b.pinned_artifacts;
        return clone(t);
      },
    },
    {
      method: "DELETE",
      pattern: /^\/workspaces\/([^/]+)\/teamspaces\/([^/]+)\/$/,
      resolve: ([, slug, id]) => {
        const i = teamspaces.findIndex((x) => x.workspace_slug === slug && x.id === id);
        if (i === -1) throw new APIError(404, "Teamspace not found");
        teamspaces.splice(i, 1);
        return { success: true };
      },
    },
    {
      method: "PUT",
      pattern: /^\/workspaces\/([^/]+)\/teamspaces\/([^/]+)\/members\/$/,
      resolve: ([, slug, id], body) => {
        const t = find(slug, id);
        t.member_ids = [...new Set(((body ?? {}) as { ids?: string[] }).ids ?? [])];
        return clone(t);
      },
    },
    {
      method: "PUT",
      pattern: /^\/workspaces\/([^/]+)\/teamspaces\/([^/]+)\/projects\/$/,
      resolve: ([, slug, id], body) => {
        const t = find(slug, id);
        const ids = new Set(((body ?? {}) as { ids?: string[] }).ids ?? []);
        // Only accept projects in this workspace (mirrors the backend guard).
        t.project_ids = projects
          .filter((p) => p.workspace_slug === slug && ids.has(p.id))
          .map((p) => p.id);
        return clone(t);
      },
    },
    {
      method: "GET",
      pattern: /^\/workspaces\/([^/]+)\/teamspaces\/([^/]+)\/overview\/$/,
      resolve: ([, slug, id]) => {
        const t = find(slug, id);
        const teamProjects = projects.filter(
          (p) => p.workspace_slug === slug && t.project_ids.includes(p.id),
        );
        return clone({
          projects: teamProjects,
          rollup: rollup(t.project_ids),
          human_workload: humanWorkload(t.project_ids),
          agent_workload: AGENT_WORKLOAD,
          pinned_roster: t.pinned_artifacts
            .map((aid) => rosterArtifacts[aid])
            .filter(Boolean),
        });
      },
    },
  ];
}
