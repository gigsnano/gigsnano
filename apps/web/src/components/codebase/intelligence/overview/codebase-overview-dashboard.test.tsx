// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ICodebaseOverview } from "@/types/code/overview";

import { CodebaseOverviewDashboard } from "./codebase-overview-dashboard";

const READY: ICodebaseOverview = {
  state: "ready",
  index: {
    status: "ready", repo_full_name: "o/r", branch: "main", indexed_commit_sha: "abc",
    indexed_at: null, head_commit_sha: null, drifted: false, error: null,
  },
  counts: { state: "available", source: "index", built_at: null, detail: null, files: 10, loc: 100, symbols: 42, edges: 5, languages: 2, languages_source: "scc" },
  health: {
    state: "available", source: "static-analysis", built_at: null, detail: null, score: 70, measured_dimensions: 2,
    dimensions: [
      { key: "security", label: "Security", status: "warning", score: 70, evidence: "1 error", drilldown: "issues" },
      { key: "test_coverage", label: "Test coverage", status: "unavailable", score: null, evidence: "not measured", drilldown: null },
    ],
  },
  modules: { state: "available", source: "index", built_at: null, detail: null, items: [{ key: "src/auth", name: "auth", files: 3, symbols: 20 }] },
  risks: { state: "available", source: "semgrep", built_at: null, detail: null, items: [] },
  changes: { state: "available", source: "git", built_at: null, detail: null, items: [] },
};

vi.mock("@/hooks/codebase/use-codebase-overview", () => ({
  useCodebaseOverview: () => ({ data: READY, isLoading: false, isError: false, refetch: vi.fn() }),
}));
vi.mock("@/hooks/code/use-index-status", () => ({
  useStartIndex: () => ({ mutate: vi.fn(), isPending: false }),
}));

describe("CodebaseOverviewDashboard", () => {
  let sink: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    sink = vi.fn();
    (window as unknown as { gnAnalytics: unknown }).gnAnalytics = sink;
  });
  afterEach(() => {
    cleanup();
    delete (window as unknown as { gnAnalytics?: unknown }).gnAnalytics;
    vi.clearAllMocks();
  });

  it("renders the sections and fires the load event", () => {
    render(<CodebaseOverviewDashboard workspaceSlug="acme" projectId="p1" onOpenView={vi.fn()} onAsk={vi.fn()} />);
    expect(screen.getByText("Codebase health")).toBeInTheDocument();
    expect(screen.getByText("Architecture map")).toBeInTheDocument();
    expect(sink).toHaveBeenCalledWith("codebase_overview_loaded", { project_id: "p1", state: "ready" });
  });

  it("tracks a drill-down and forwards the target view", () => {
    const onOpenView = vi.fn();
    render(<CodebaseOverviewDashboard workspaceSlug="acme" projectId="p1" onOpenView={onOpenView} onAsk={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Security report" }));
    expect(onOpenView).toHaveBeenCalledWith("issues");
    expect(sink).toHaveBeenCalledWith("codebase_drilldown", { project_id: "p1", target: "issues" });
  });

  it("tracks quick-path selection", () => {
    render(<CodebaseOverviewDashboard workspaceSlug="acme" projectId="p1" onOpenView={vi.fn()} onAsk={vi.fn()} />);
    fireEvent.click(screen.getByText("Review risks"));
    expect(sink).toHaveBeenCalledWith("codebase_quick_path", { project_id: "p1", path: "review-risks" });
  });
});
