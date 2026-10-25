import { APIError } from "@/services/api-error";
import { slipBand } from "@/lib/roadmap/slip";
import { EStoryStatus } from "@/types";

import { allStories } from "../data/stories";
import { initiatives, releases, type IMockInitiative, type IMockRelease } from "../data/roadmap";

type Handler = {
  method: string;
  pattern: RegExp;
  resolve: (match: RegExpMatchArray, body: unknown) => unknown;
};

const clone = <T>(value: T): T => structuredClone(value);

let initSeq = initiatives.length;
let relSeq = releases.length;

// Pre-link a few done prj_mba items to the unreleased v2.1 so scope + changelog
// generation are demoable out of the box.
(() => {
  const done = allStories.filter(
    (s) => s.project_id === "prj_mba" && s.status === EStoryStatus.Done,
  );
  for (const s of done.slice(0, 3)) s.release_id = "rel_21";
})();

function initOut(i: IMockInitiative) {
  const { workspace_slug: _s, _total, _done, ...wire } = i;
  void _s;
  void _total;
  void _done;
  return wire;
}

function rollupFor(i: IMockInitiative) {
  const { signal, reason } = slipBand(i._total, i._done, i.target_date, new Date());
  return {
    total: i._total,
    done: i._done,
    progress_pct: i._total ? Math.round((i._done / i._total) * 100) : 0,
    slip_signal: signal,
    slip_reason: reason,
  };
}

function findInit(slug: string, id: string): IMockInitiative {
  const i = initiatives.find((x) => x.workspace_slug === slug && x.id === id);
  if (!i) throw new APIError(404, "Initiative not found");
  return i;
}

function findRelease(projectId: string, id: string): IMockRelease {
  const r = releases.find((x) => x.project_id === projectId && x.id === id);
  if (!r) throw new APIError(404, "Release not found");
  return r;
}

function changelogFrom(release: IMockRelease): string {
  const titles = allStories
    .filter((s) => s.release_id === release.id && s.status === EStoryStatus.Done)
    .map((s) => s.title);
  const body = titles.map((t) => `- **Added:** ${t}`).join("\n");
  return `## ${release.version}${release.name ? ` — ${release.name}` : ""}\n\n${body}`;
}

export function makeRoadmapHandlers(): Handler[] {
  return [
    // ---- Initiatives (workspace) ----
    {
      method: "GET",
      pattern: /^\/workspaces\/([^/]+)\/initiatives\/$/,
      resolve: ([, slug]) =>
        clone(initiatives.filter((i) => i.workspace_slug === slug).map(initOut)),
    },
    {
      method: "POST",
      pattern: /^\/workspaces\/([^/]+)\/initiatives\/$/,
      resolve: ([, slug], body) => {
        const b = (body ?? {}) as Partial<IMockInitiative>;
        if (!b.title?.trim()) throw new APIError(400, "A title is required");
        const created: IMockInitiative = {
          id: `init_${++initSeq}`,
          workspace_slug: slug,
          workspace_id: "ws_1",
          title: b.title.trim(),
          description: b.description ?? "",
          status: b.status ?? "planned",
          lead_id: b.lead_id ?? null,
          target_date: b.target_date ?? null,
          created_at: new Date().toISOString(),
          _total: 0,
          _done: 0,
        };
        initiatives.push(created);
        return clone(initOut(created));
      },
    },
    {
      method: "PATCH",
      pattern: /^\/workspaces\/([^/]+)\/initiatives\/([^/]+)\/$/,
      resolve: ([, slug, id], body) => {
        const i = findInit(slug, id);
        const b = (body ?? {}) as Partial<IMockInitiative>;
        if (b.title !== undefined) i.title = b.title.trim();
        if (b.description !== undefined) i.description = b.description;
        if (b.status !== undefined) i.status = b.status;
        if (b.lead_id !== undefined) i.lead_id = b.lead_id;
        if (b.target_date !== undefined) i.target_date = b.target_date;
        return clone(initOut(i));
      },
    },
    {
      method: "DELETE",
      pattern: /^\/workspaces\/([^/]+)\/initiatives\/([^/]+)\/$/,
      resolve: ([, slug, id]) => {
        const idx = initiatives.findIndex((x) => x.workspace_slug === slug && x.id === id);
        if (idx === -1) throw new APIError(404, "Initiative not found");
        initiatives.splice(idx, 1);
        return { success: true };
      },
    },
    {
      method: "GET",
      pattern: /^\/workspaces\/([^/]+)\/initiatives\/([^/]+)\/rollup\/$/,
      resolve: ([, slug, id]) => clone(rollupFor(findInit(slug, id))),
    },
    {
      method: "POST",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/roadmap\/draft-initiatives\/$/,
      resolve: () => ({
        initiatives: [
          { title: "Reliability & uptime", description: "Hit 99.9% and cut MTTR." },
          { title: "Onboarding activation", description: "Get new teams to first value fast." },
          { title: "Billing & monetization", description: "Plans, metering and expansion." },
        ],
      }),
    },
    // ---- Releases (project) ----
    {
      method: "GET",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/releases\/$/,
      resolve: ([, , projectId]) =>
        clone(
          releases
            .filter((r) => r.project_id === projectId)
            .sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
        ),
    },
    {
      method: "POST",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/releases\/$/,
      resolve: ([, , projectId], body) => {
        const b = (body ?? {}) as { version?: string; name?: string; status?: string };
        if (!b.version?.trim()) throw new APIError(400, "A version is required");
        const created: IMockRelease = {
          id: `rel_${++relSeq}`,
          project_id: projectId,
          version: b.version.trim(),
          name: b.name ?? "",
          changelog_md: "",
          status: b.status ?? "unreleased",
          released_at: null,
          created_at: new Date().toISOString(),
        };
        releases.push(created);
        return clone(created);
      },
    },
    {
      method: "PATCH",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/releases\/([^/]+)\/$/,
      resolve: ([, , projectId, id], body) => {
        const r = findRelease(projectId, id);
        const b = (body ?? {}) as Partial<IMockRelease>;
        if (b.version !== undefined) r.version = b.version.trim();
        if (b.name !== undefined) r.name = b.name;
        if (b.changelog_md !== undefined) r.changelog_md = b.changelog_md;
        if (b.status !== undefined) {
          r.status = b.status;
          if (b.status === "released" && !r.released_at) r.released_at = new Date().toISOString();
        }
        return clone(r);
      },
    },
    {
      method: "POST",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/releases\/([^/]+)\/link\/$/,
      resolve: ([, , projectId, id], body) => {
        const r = findRelease(projectId, id);
        const ids = new Set(((body ?? {}) as { story_ids?: string[] }).story_ids ?? []);
        for (const s of allStories) {
          if (s.project_id === projectId && ids.has(s.id)) s.release_id = r.id;
        }
        return clone(r);
      },
    },
    {
      method: "POST",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/releases\/([^/]+)\/changelog\/$/,
      resolve: ([, , projectId, id]) => {
        const r = findRelease(projectId, id);
        const linked = allStories.some(
          (s) => s.release_id === r.id && s.status === EStoryStatus.Done,
        );
        if (!linked) throw new APIError(400, "No shipped work items linked to this release");
        r.changelog_md = changelogFrom(r);
        return clone(r);
      },
    },
  ];
}
