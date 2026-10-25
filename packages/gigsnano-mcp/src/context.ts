import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { GigsnanoClient } from "./client.js";

export interface ProjectContext {
  workspace_slug: string;
  project_id: string;
  identifier: string;
}

export async function resolveContext(
  client: GigsnanoClient,
  opts: { repoFullName?: string | null; project?: string; cwd?: string },
): Promise<ProjectContext> {
  if (opts.project) {
    // Explicit "workspace/project_id" override.
    const [workspace_slug, project_id] = opts.project.split("/");
    if (workspace_slug && project_id) {
      return { workspace_slug, project_id, identifier: "" };
    }
  }
  try {
    const raw = await readFile(join(opts.cwd ?? process.cwd(), ".gigsnano.json"), "utf8");
    const cfg = JSON.parse(raw) as Partial<ProjectContext>;
    if (cfg.workspace_slug && cfg.project_id) return cfg as ProjectContext;
  } catch { /* no config file — fall through */ }

  if (opts.repoFullName) {
    return client.projectByRepo(opts.repoFullName);
  }
  throw new Error(
    "Could not determine the GigsNano project. Tried: explicit project arg, " +
    ".gigsnano.json in the repo root, and the git remote. Add a `origin` remote " +
    "matching a connected project, or pass an explicit project.",
  );
}
