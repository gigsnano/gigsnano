import { describe, it, expect, beforeEach } from "vitest";
import {
  ESSENTIAL_WORKSPACE_IDS,
  PERSONAL_ITEMS,
  WORKSPACE_ITEMS,
  reconcilePrefs,
} from "@/lib/nav/sidebar-nav-items";
import { useSidebarNav } from "./sidebar-nav.store";

// Reset the store to defaults before each test (persist reads from a
// jsdom-less env; state starts at the seeded defaults).
beforeEach(() => {
  useSidebarNav.setState({
    personal: reconcilePrefs(undefined, PERSONAL_ITEMS),
    workspace: reconcilePrefs(undefined, WORKSPACE_ITEMS, ESSENTIAL_WORKSPACE_IDS),
    limitProjects: false,
    projectLimit: 10,
    favorites: [],
  });
});

describe("useSidebarNav", () => {
  it("seeds all personal items and only essential workspace items as pinned", () => {
    const { personal, workspace } = useSidebarNav.getState();
    expect(personal.every((p) => p.pinned)).toBe(true);
    expect(workspace.filter((p) => p.pinned).map((p) => p.id).sort()).toEqual([
      "analytics",
      "dashboards",
      "trash",
      "views",
    ]);
    expect(workspace.filter((p) => !p.pinned).length).toBeGreaterThan(0);
    expect(personal.length).toBeGreaterThan(0);
  });

  it("togglePinned flips a single item's pinned flag", () => {
    const id = useSidebarNav.getState().personal[0].id;
    useSidebarNav.getState().togglePinned("personal", id);
    expect(useSidebarNav.getState().personal.find((p) => p.id === id)?.pinned).toBe(false);
  });

  it("setProjectLimit clamps the value", () => {
    useSidebarNav.getState().setProjectLimit(999);
    expect(useSidebarNav.getState().projectLimit).toBe(100);
  });

  it("toggleFavorite adds then removes a project id", () => {
    useSidebarNav.getState().toggleFavorite("p1");
    expect(useSidebarNav.getState().favorites).toContain("p1");
    useSidebarNav.getState().toggleFavorite("p1");
    expect(useSidebarNav.getState().favorites).not.toContain("p1");
  });
});
