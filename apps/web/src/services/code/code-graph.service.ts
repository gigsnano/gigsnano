import type { ICodeGraph, IErdSchema } from "@/types";
import type { ISymbolTraceability } from "@/types/code/graph";
import type { ICodebaseOverview } from "@/types/code/overview";

import { APIService } from "../api.service";

class CodeGraphService extends APIService {
  /** The Codebase Overview aggregation (GIN-272): index freshness, counts, health,
   * modules, risks, and recent changes with per-section provenance/state. Unlike
   * the other code endpoints this NEVER 409s — it returns 200 in every index state
   * so the dashboard can render indexing/unavailable/stale honestly. */
  getOverview(workspaceSlug: string, projectId: string) {
    return this.get<ICodebaseOverview>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/code/overview/`,
    );
  }

  /** The project's codebase graph (`graph.json`, community-aggregated past the
   * backend's node cap unless `view=full`). 409s when the index isn't ready. */
  getGraph(workspaceSlug: string, projectId: string, view: "auto" | "full" = "auto") {
    return this.get<ICodeGraph>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/code/graph/?view=${view}`,
    );
  }

  /** SDLC traceability for a code symbol (GIA-15): the stories that modify it +
   * the stories impacted if it changes. Empty until the SDLC graph is projected. */
  getSymbolTraceability(workspaceSlug: string, projectId: string, nodeId: string) {
    return this.get<ISymbolTraceability>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/code/symbols/${encodeURIComponent(nodeId)}/traceability/`,
    );
  }

  /** The project's ER schema (`er.json`), extracted from a committed DBML/Prisma
   * schema at index time. Empty `tables` ⇒ no schema source detected. 409s pre-index. */
  getErSchema(workspaceSlug: string, projectId: string) {
    return this.get<IErdSchema>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/code/er/`,
    );
  }

  /** Analyze the repo's DB models on demand and (re)generate the ER schema
   * (GIN-86): committed .dbml/Prisma if present, else inferred from SQLAlchemy/
   * Django model classes. Read-only over the clone. 409s pre-index. */
  generateErSchema(workspaceSlug: string, projectId: string) {
    return this.post<IErdSchema>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/code/er/generate/`,
    );
  }

  /** Parse raw DBML into an ER schema (backend pydbml). Backs the chat's
   * dbml-only `gigs:erd` blocks; the endpoint is pure (ignores the project). */
  async parseDbml(workspaceSlug: string, projectId: string, dbml: string, id: string) {
    const parsed = await this.post<Omit<IErdSchema, "id">>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/code/parse-dbml/`,
      { dbml },
    );
    return { id, ...parsed } satisfies IErdSchema;
  }

  /** Kick off (or retry) a codebase index build. */
  startIndex(workspaceSlug: string, projectId: string) {
    return this.post<{ id: string; index_status: string }>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/index/`,
    );
  }
}

export const codeGraphService = new CodeGraphService();
