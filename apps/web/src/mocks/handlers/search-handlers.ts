import type { IWorkspaceSearchResults } from "@/types";

import { allStories } from "../data/stories";
import { cycles } from "../data/cycles";
import { modules } from "../data/modules";
import { pages } from "../data/pages";
import { projects } from "../data/projects";
import { views } from "../data/views";

type Handler = {
  method: string;
  pattern: RegExp;
  resolve: (match: RegExpMatchArray, body: unknown, query: URLSearchParams) => unknown;
};

// ponytail: fixed per-entity cap, no pagination — mirrors the backend's fixed
// _LIMIT (search/service.py); add offset/limit if the palette ever needs more.
const LIMIT = 20;

const includes = (value: string, term: string) => value.toLowerCase().includes(term.toLowerCase());

/**
 * Grouped multi-entity search (GIN-35), mirroring `search/service.py`: per-entity
 * ilike-style substring match on name/title (+ project identifier for projects,
 * + exact story_number for work items), scoped to one project when
 * `scope=project`. No membership/access filtering — the mock has none elsewhere either.
 */
export function makeSearchHandlers(): Handler[] {
  return [
    {
      method: "GET",
      pattern: /^\/workspaces\/([^/]+)\/search\/$/,
      resolve: ([, slug], _body, query) => {
        const q = query.get("q")?.trim() ?? "";
        const scopedProjectId =
          query.get("scope") === "project" ? query.get("project_id") : null;
        const inScope = (projectId: string) => !scopedProjectId || projectId === scopedProjectId;
        const matches = (value: string) => q === "" || includes(value, q);

        const result: IWorkspaceSearchResults = {
          projects: projects
            .filter(
              (p) =>
                p.workspace_slug === slug &&
                inScope(p.id) &&
                (q === "" || matches(p.name) || matches(p.identifier)),
            )
            .slice(0, LIMIT)
            .map((p) => ({ id: p.id, name: p.name, identifier: p.identifier })),
          work_items: allStories
            .filter(
              (s) =>
                s.workspace_slug === slug &&
                inScope(s.project_id) &&
                (matches(s.title) || (q !== "" && String(s.story_number ?? "") === q)),
            )
            .slice(0, LIMIT)
            .map((s) => ({
              id: s.id,
              project_id: s.project_id,
              title: s.title,
              story_number: s.story_number ?? null,
            })),
          cycles: cycles
            .filter((c) => c.workspace_slug === slug && inScope(c.project_id) && matches(c.name))
            .slice(0, LIMIT)
            .map((c) => ({ id: c.id, project_id: c.project_id, name: c.name })),
          modules: modules
            .filter((m) => m.workspace_slug === slug && inScope(m.project_id) && matches(m.name))
            .slice(0, LIMIT)
            .map((m) => ({ id: m.id, project_id: m.project_id, name: m.name })),
          views: views
            .filter((v) => v.workspace_slug === slug && inScope(v.project_id) && matches(v.name))
            .slice(0, LIMIT)
            .map((v) => ({ id: v.id, project_id: v.project_id, name: v.name })),
          pages: pages
            .filter((pg) => pg.workspace_slug === slug && inScope(pg.project_id) && matches(pg.title))
            .slice(0, LIMIT)
            .map((pg) => ({ id: pg.id, project_id: pg.project_id, title: pg.title })),
        };
        return result;
      },
    },
  ];
}
