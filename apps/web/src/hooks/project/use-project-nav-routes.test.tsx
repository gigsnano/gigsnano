// @vitest-environment jsdom
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  ESolutionAvailability,
  ESolutionKey,
  type IProject,
  type ISolutionDefinition,
} from "@/types";

// The single-project fetch never settles — the state right after a project switch.
vi.mock("@/services/project/project.service", () => ({
  projectService: {
    getProject: () => new Promise(() => {}),
    getProjects: () => Promise.resolve([raProject]),
  },
}));
vi.mock("@/services/project/cycle.service", () => ({ cycleService: {} }));
vi.mock("@/services/solution/solution.service", () => ({
  solutionService: {
    getSolutions: () => Promise.resolve({ solutions: [revenueAssurance] }),
  },
}));

const raProject = {
  id: "ra1",
  name: "Leakage review",
  solution_key: ESolutionKey.RevenueAssurance,
} as IProject;

const revenueAssurance = {
  key: ESolutionKey.RevenueAssurance,
  version: 1,
  name: "Revenue Assurance",
  outcome: "",
  description: "",
  container_noun: "assurance workspace",
  capabilities: [],
  starting_points: [],
  navigation: [
    { key: "home", label: "Assurance Home", path: "", requires_capability: null },
    { key: "contracts", label: "Contracts", path: "contracts", requires_capability: null },
  ],
  availability: ESolutionAvailability.Available,
  availability_reason: null,
} as ISolutionDefinition;

import { useProjectNavRoutes, useRailProject } from "./use-project-nav-routes";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useRailProject", () => {
  it("falls back to the projects list row while the single fetch is pending", async () => {
    const { result } = renderHook(() => useRailProject("acme", "ra1"), { wrapper });
    await waitFor(() => expect(result.current?.name).toBe("Leakage review"));
  });
});

describe("useProjectNavRoutes", () => {
  it("resolves the container's own rows from the list row, not the SD fallback", async () => {
    const { result } = renderHook(() => useProjectNavRoutes("acme", "ra1"), { wrapper });
    await waitFor(() =>
      expect(result.current.map((r) => r.label)).toEqual(["Assurance Home", "Contracts"]),
    );
  });
});
