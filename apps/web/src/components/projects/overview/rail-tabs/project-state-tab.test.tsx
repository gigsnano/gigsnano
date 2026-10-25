// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EMemberStatus, EProjectRole, type IProject } from "@/types";

import { ProjectStateTab } from "./project-state-tab";

const { canEdit, mutateAsync } = vi.hoisted(() => ({
  canEdit: { value: true },
  mutateAsync: vi.fn(),
}));

vi.mock("@/hooks/workspace/use-users", () => ({
  useUser: (id: string) =>
    id ? { data: { id, display_name: "Ada Lovelace", avatar_url: null } } : { data: undefined },
}));

vi.mock("@/hooks/project/use-project-members", () => ({
  useProjectMembers: () => ({
    data: [
      {
        id: "pm_1",
        user_id: "u_1",
        display_name: "Ada Lovelace",
        email: "ada@acme.dev",
        avatar_url: null,
        role: EProjectRole.Owner,
        status: EMemberStatus.Active,
      },
      {
        id: "pm_2",
        user_id: "u_2",
        display_name: "Grace Hopper",
        email: "grace@acme.dev",
        avatar_url: null,
        role: EProjectRole.Member,
        status: EMemberStatus.Active,
      },
      {
        id: "pm_3",
        user_id: "u_3",
        display_name: "Pending Person",
        email: "pending@acme.dev",
        avatar_url: null,
        role: EProjectRole.Member,
        status: EMemberStatus.Pending,
      },
    ],
  }),
}));

vi.mock("@/hooks/project/use-project-permissions", () => ({
  useProjectPermissions: () => ({ can: () => canEdit.value }),
}));

vi.mock("@/hooks/project/use-project-settings", () => ({
  useUpdateProject: () => ({ mutateAsync, isPending: false, isError: false, error: null }),
}));

const project = {
  id: "prj_1",
  name: "Acme",
  identifier: "ACM",
  lead_id: "u_1",
  members: [],
  member_count: 2,
  sprint_zero_progress: 40,
  start_date: "2026-07-01",
  target_date: "2026-07-31",
} as unknown as IProject;

const renderTab = () =>
  render(<ProjectStateTab project={project} workspaceSlug="acme" projectId="prj_1" />);

beforeEach(() => {
  canEdit.value = true;
  mutateAsync.mockReset();
  mutateAsync.mockResolvedValue(undefined);
  // Radix's popover positioning needs these; jsdom ships neither.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.hasPointerCapture ??= () => false;
});

afterEach(cleanup);

describe("ProjectStateTab", () => {
  it("keeps lead and dates read-only without manage-settings permission", () => {
    canEdit.value = false;
    renderTab();

    expect(screen.queryByRole("button", { name: "Change project lead" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Change start date" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Change target date" })).toBeNull();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
  });

  it("saves a new lead picked from the active project members", async () => {
    renderTab();

    fireEvent.click(screen.getByRole("button", { name: "Change project lead" }));
    // Pending members are not eligible leads.
    expect(screen.queryByText("Pending Person")).toBeNull();

    fireEvent.click(screen.getByText("Grace Hopper"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ lead_id: "u_2" }));
  });

  it("blocks saving a start date later than the target date", () => {
    renderTab();

    fireEvent.click(screen.getByRole("button", { name: "Change start date" }));
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-08-15" } });

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByText(/on or before the target date/i)).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("saves a valid target date change", async () => {
    renderTab();

    fireEvent.click(screen.getByRole("button", { name: "Change target date" }));
    fireEvent.change(screen.getByLabelText("Target date"), { target: { value: "2026-09-30" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({ target_date: "2026-09-30" }),
    );
  });
});
