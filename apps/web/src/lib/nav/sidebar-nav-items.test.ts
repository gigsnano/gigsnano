import { describe, it, expect } from "vitest";
import {
  PERSONAL_ITEMS,
  WORKSPACE_ITEMS,
  ESSENTIAL_WORKSPACE_IDS,
  reconcilePrefs,
  splitPinned,
  clampProjectLimit,
  type ISidebarNavItem,
  type ISidebarPref,
} from "./sidebar-nav-items";

const CATALOG: ISidebarNavItem[] = [
  { id: "a", label: "A", icon: [] as unknown as ISidebarNavItem["icon"], href: (b) => b },
  { id: "b", label: "B", icon: [] as unknown as ISidebarNavItem["icon"], href: (b) => b },
  { id: "c", label: "C", icon: [] as unknown as ISidebarNavItem["icon"], href: (b) => b },
];

describe("reconcilePrefs", () => {
  it("seeds all catalog items pinned, in order, when nothing is stored", () => {
    expect(reconcilePrefs(undefined, CATALOG)).toEqual([
      { id: "a", pinned: true },
      { id: "b", pinned: true },
      { id: "c", pinned: true },
    ]);
  });

  it("drops stored ids no longer in the catalog", () => {
    const stored: ISidebarPref[] = [
      { id: "a", pinned: false },
      { id: "zombie", pinned: true },
    ];
    const result = reconcilePrefs(stored, CATALOG);
    expect(result.find((p) => p.id === "zombie")).toBeUndefined();
  });

  it("appends new catalog items (pinned) after preserved stored order + pinned", () => {
    const stored: ISidebarPref[] = [
      { id: "c", pinned: false },
      { id: "a", pinned: true },
    ];
    expect(reconcilePrefs(stored, CATALOG)).toEqual([
      { id: "c", pinned: false },
      { id: "a", pinned: true },
      { id: "b", pinned: true },
    ]);
  });

  it("seeds only allowlisted items pinned when defaultPinnedIds is given (GIN-316)", () => {
    expect(reconcilePrefs(undefined, CATALOG, new Set(["b"]))).toEqual([
      { id: "a", pinned: false },
      { id: "b", pinned: true },
      { id: "c", pinned: false },
    ]);
  });

  it("preserves a user's stored selection even with an allowlist (no overwrite)", () => {
    // 'a' is not allowlisted but the user pinned it — keep it. Only the appended
    // (never-seen) 'b'/'c' fall back to the allowlist default.
    const stored: ISidebarPref[] = [{ id: "a", pinned: true }];
    expect(reconcilePrefs(stored, CATALOG, new Set(["c"]))).toEqual([
      { id: "a", pinned: true },
      { id: "b", pinned: false },
      { id: "c", pinned: true },
    ]);
  });

  it("a future (non-allowlisted) workspace item defaults unpinned", () => {
    const withFuture: ISidebarNavItem[] = [
      ...WORKSPACE_ITEMS,
      { id: "brand-new", label: "New", icon: [] as unknown as ISidebarNavItem["icon"], href: (b) => b },
    ];
    const seeded = reconcilePrefs(undefined, withFuture, ESSENTIAL_WORKSPACE_IDS);
    expect(seeded.find((p) => p.id === "brand-new")).toEqual({ id: "brand-new", pinned: false });
  });
});

describe("new-workspace workspace defaults (GIN-316)", () => {
  it("pins exactly Dashboards, Views, Analytics, Trash and nothing else", () => {
    const seeded = reconcilePrefs(undefined, WORKSPACE_ITEMS, ESSENTIAL_WORKSPACE_IDS);
    const pinned = seeded.filter((p) => p.pinned).map((p) => p.id).sort();
    expect(pinned).toEqual(["analytics", "dashboards", "trash", "views"]);
    // Intake / Customers explicitly start off.
    expect(seeded.find((p) => p.id === "intake")).toEqual({ id: "intake", pinned: false });
    expect(seeded.find((p) => p.id === "customers")).toEqual({ id: "customers", pinned: false });
  });

  it("personal items keep pinning-all-by-default (outside this change)", () => {
    const seeded = reconcilePrefs(undefined, PERSONAL_ITEMS);
    expect(seeded.every((p) => p.pinned)).toBe(true);
  });
});

describe("splitPinned", () => {
  it("splits into pinned + overflow preserving pref order, skipping unknown ids", () => {
    const prefs: ISidebarPref[] = [
      { id: "b", pinned: true },
      { id: "ghost", pinned: true },
      { id: "a", pinned: false },
      { id: "c", pinned: true },
    ];
    const { pinned, overflow } = splitPinned(prefs, CATALOG);
    expect(pinned.map((i) => i.id)).toEqual(["b", "c"]);
    expect(overflow.map((i) => i.id)).toEqual(["a"]);
  });
});

describe("clampProjectLimit", () => {
  it("clamps below 1 up to 1", () => expect(clampProjectLimit(0)).toBe(1));
  it("clamps above 100 down to 100", () => expect(clampProjectLimit(500)).toBe(100));
  it("floors fractional values", () => expect(clampProjectLimit(3.7)).toBe(3));
  it("falls back to 10 for non-finite input", () => expect(clampProjectLimit(NaN)).toBe(10));
});

describe("catalog shape", () => {
  it("has unique ids per group", () => {
    for (const group of [PERSONAL_ITEMS, WORKSPACE_ITEMS]) {
      const ids = group.map((i) => i.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
