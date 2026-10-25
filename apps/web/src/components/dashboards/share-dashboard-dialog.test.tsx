// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  EDashboardVisibility,
  EDashboardWidgetType,
  type IDashboard,
  type IDashboardWidget,
} from "@/types";

import { ShareDashboardDialog } from "./share-dashboard-dialog";
import {
  PUBLIC_ELIGIBLE_WIDGET_TYPES,
  blockedPublicWidgetLabels,
} from "./widgets/widget-registry";

const { share, regenerate } = vi.hoisted(() => ({
  share: vi.fn(),
  regenerate: vi.fn(),
}));

vi.mock("@/hooks/workspace/use-dashboards", () => ({
  useShareDashboard: () => ({ mutate: share, isPending: false, error: null }),
  useRegeneratePublicLink: () => ({ mutate: regenerate, isPending: false, error: null }),
}));

const widget = (type: EDashboardWidgetType, id: string): IDashboardWidget => ({
  id,
  type,
  title: id,
  x: 0,
  y: 0,
  w: 4,
  h: 3,
});

const dashboard = (over: Partial<IDashboard> = {}): IDashboard =>
  ({
    id: "dsh_1",
    workspace_slug: "acme",
    owner_id: "u_1",
    name: "Delivery",
    description: "",
    is_favorite: false,
    layout: { columns: 2 },
    config: { widgets: [widget(EDashboardWidgetType.StatusDonut, "w1")] },
    visibility: EDashboardVisibility.Private,
    public_token: null,
    published_at: null,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    ...over,
  }) as IDashboard;

const renderDialog = (d: IDashboard) =>
  render(
    <ShareDashboardDialog
      open
      onOpenChange={() => {}}
      dashboard={d}
      workspaceSlug="acme"
    />,
  );

beforeEach(() => {
  share.mockReset();
  regenerate.mockReset();
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

afterEach(cleanup);

describe("public widget eligibility", () => {
  it("excludes personal, per-person and raw work-item widgets", () => {
    const ineligible = [
      EDashboardWidgetType.AssignedToMe,
      EDashboardWidgetType.InProgress,
      EDashboardWidgetType.Watched,
      EDashboardWidgetType.TeamWorkload,
      EDashboardWidgetType.AssigneeActivity,
      EDashboardWidgetType.Activity,
      EDashboardWidgetType.StoryList,
      EDashboardWidgetType.RiskList,
      EDashboardWidgetType.ProjectHealthSummary,
    ];
    for (const type of ineligible) {
      expect(PUBLIC_ELIGIBLE_WIDGET_TYPES.has(type)).toBe(false);
    }
    expect(PUBLIC_ELIGIBLE_WIDGET_TYPES.has(EDashboardWidgetType.StatusDonut)).toBe(true);
  });

  it("names each blocked widget once, in board order", () => {
    const labels = blockedPublicWidgetLabels([
      widget(EDashboardWidgetType.StatusDonut, "a"),
      widget(EDashboardWidgetType.TeamWorkload, "b"),
      widget(EDashboardWidgetType.AssignedToMe, "c"),
      widget(EDashboardWidgetType.TeamWorkload, "d"),
    ]);
    expect(labels).toEqual(["Team workload", "Assigned to me"]);
  });
});

describe("ShareDashboardDialog", () => {
  it("publishes when Public is chosen", () => {
    renderDialog(dashboard());
    fireEvent.click(screen.getByLabelText(/Public/));
    expect(share).toHaveBeenCalledWith({
      dashboardId: "dsh_1",
      visibility: EDashboardVisibility.Public,
    });
  });

  it("warns which widgets visitors won't see", () => {
    renderDialog(
      dashboard({
        config: {
          widgets: [
            widget(EDashboardWidgetType.StatusDonut, "w1"),
            widget(EDashboardWidgetType.TeamWorkload, "w2"),
          ],
        },
      }),
    );
    expect(screen.getByText(/won.t see Team workload/)).toBeInTheDocument();
  });

  it("explains that a board with only ineligible widgets can't go public", () => {
    renderDialog(
      dashboard({
        config: { widgets: [widget(EDashboardWidgetType.AssignedToMe, "w1")] },
      }),
    );
    expect(screen.getByText(/can.t be made/)).toBeInTheDocument();
    // The restriction is about anonymous visitors, so workspace sharing is
    // offered as the way out rather than leaving the owner stuck.
    expect(screen.getByText(/share it with the workspace instead/)).toBeInTheDocument();
  });

  it("offers workspace sharing as a level between private and public", () => {
    renderDialog(dashboard({}));
    expect(
      screen.getByRole("radio", { name: /shared with the workspace/i }),
    ).toBeInTheDocument();
  });

  it("shows, copies and can rotate or revoke the link once public", async () => {
    renderDialog(
      dashboard({ visibility: EDashboardVisibility.Public, public_token: "tok_abc" }),
    );

    const field = screen.getByLabelText("Public dashboard link") as HTMLInputElement;
    expect(field.value).toContain("/public/d/tok_abc");
    // The internal id is never the credential.
    expect(field.value).not.toContain("dsh_1");

    fireEvent.click(screen.getByRole("button", { name: /Copy link/ }));
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(field.value),
    );
    expect(await screen.findByRole("button", { name: /Copied/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Regenerate link" }));
    expect(regenerate).toHaveBeenCalledWith("dsh_1");

    fireEvent.click(screen.getByRole("button", { name: "Disable public" }));
    expect(share).toHaveBeenCalledWith({
      dashboardId: "dsh_1",
      visibility: EDashboardVisibility.Private,
    });
  });
});
