// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EViewLayout, EViewShareScope, type IProjectView } from "@/types";

const favoriteMutate = vi.fn();
const deleteMutate = vi.fn();
let viewsData: IProjectView[] = [];

vi.mock("@/hooks/auth/use-auth", () => ({
  useAuthUser: () => ({ data: { id: "u_1", display_name: "Ada Lovelace" } }),
}));

vi.mock("@/hooks/project/use-project-settings", () => ({
  useProjectFeatureFlags: () => ({ views: true, isPending: false }),
}));

vi.mock("@/hooks/project/use-views", () => ({
  useProjectViews: () => ({
    data: viewsData,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useDeleteView: () => ({ mutate: deleteMutate, isPending: false }),
  useToggleViewFavorite: () => ({ mutate: favoriteMutate, isPending: false }),
  useUpdateView: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

import { ProjectViewsList } from "./project-views-list";

function savedView(overrides: Partial<IProjectView>): IProjectView {
  return {
    id: "view_1",
    workspace_slug: "acme",
    project_id: "prj_mba",
    name: "Shared board",
    description: "Team filter",
    layout: EViewLayout.Board,
    filter_query: "status:todo",
    owner_id: "u_2",
    owner_name: "Alan Turing",
    share_scope: EViewShareScope.Project,
    is_favorite: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  viewsData = [];
  favoriteMutate.mockClear();
  deleteMutate.mockClear();
});
afterEach(cleanup);

describe("ProjectViewsList", () => {
  it("shows share scope and hides owner actions for non-owned views", () => {
    viewsData = [savedView({})];
    render(<ProjectViewsList workspaceSlug="acme" projectId="prj_mba" />);

    expect(screen.getByText("Project")).toBeInTheDocument();
    expect(screen.getByText(/Alan Turing/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete view" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add to favorites" })).toBeInTheDocument();
  });

  it("shows edit and delete for owned views", () => {
    viewsData = [savedView({ owner_id: "u_1", owner_name: "Ada Lovelace" })];
    render(<ProjectViewsList workspaceSlug="acme" projectId="prj_mba" />);

    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete view" })).toBeInTheDocument();
  });
});
