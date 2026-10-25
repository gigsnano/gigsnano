import { describe, expect, it } from "vitest";

import { resolveMock } from "@/mocks";
import { APIError } from "@/services/api-error";
import type { ICodeGraph } from "@/types";

describe("code graph mock handlers", () => {
  it("returns the canned graph for an already-indexed project", async () => {
    const graph = await resolveMock<ICodeGraph>(
      "GET",
      "/workspaces/acme/projects/prj_mba/code/graph/",
    );
    expect(graph.nodes.length).toBeGreaterThan(0);
    expect(graph.edges.length).toBeGreaterThan(0);
  });

  it("409s when the project's index isn't ready", async () => {
    await expect(
      resolveMock("GET", "/workspaces/acme/projects/prj_ds/code/graph/"),
    ).rejects.toMatchObject({ status: 409 } satisfies Partial<APIError>);
  });

  it("POST index/ flips the project to Ready with a fresh commit sha", async () => {
    const before = await resolveMock<{ index_status: string }>(
      "GET",
      "/workspaces/acme/projects/prj_ds/",
    );
    expect(before.index_status).toBe("failed");

    await resolveMock("POST", "/workspaces/acme/projects/prj_ds/index/");

    const after = await resolveMock<{ index_status: string; indexed_commit_sha: string | null }>(
      "GET",
      "/workspaces/acme/projects/prj_ds/",
    );
    expect(after.index_status).toBe("ready");
    expect(after.indexed_commit_sha).toBeTruthy();

    // Now that it's indexed, the graph endpoint should serve the canned graph.
    const graph = await resolveMock<ICodeGraph>(
      "GET",
      "/workspaces/acme/projects/prj_ds/code/graph/",
    );
    expect(graph.nodes.length).toBeGreaterThan(0);
  });
});
