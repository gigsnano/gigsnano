import { beforeEach, describe, it, expect } from "vitest";
import {
  ISSUES_VIEW_VERSION,
  mergePersistedIssuesView,
  migrateIssuesView,
  useIssuesViewStore,
} from "./issues-view.store";
import type { IIssuesViewStore } from "./issues-view.store";

// Minimal current-state stub (defaults incl. the type facet); actions are no-ops for the merge.
const current = {
  layout: "list", groupBy: "status", sort: [],
  filters: {
    status: [], priority: [], assignee: [], label: [], type: [], custom: {},
    cycle: [], module: [], title: "", dueFrom: null, dueTo: null, createdFrom: null, createdTo: null,
  },
  setLayout: () => {}, setGroupBy: () => {}, setSort: () => {},
  toggleFilter: () => {}, clearFilters: () => {},
} as unknown as IIssuesViewStore;

describe("mergePersistedIssuesView", () => {
  it("backfills a missing filters.type facet from old persisted state", () => {
    const oldPersisted = {
      layout: "kanban", groupBy: "priority", orderBy: "created",
      filters: { status: ["todo"], priority: [], assignee: [], label: [] }, // no `type`
    };
    const merged = mergePersistedIssuesView(oldPersisted, current);
    expect(merged.filters.type).toEqual([]);          // backfilled, not undefined
    expect(merged.filters.status).toEqual(["todo"]);  // preserved
    expect(merged.filters.title).toBe("");            // backfilled GigsQL fields
    expect(merged.filters.dueFrom).toBeNull();
    expect(merged.layout).toBe("kanban");             // top-level persisted wins
  });

  it("tolerates persisted state with no filters object", () => {
    const merged = mergePersistedIssuesView({ layout: "list" }, current);
    expect(merged.filters.type).toEqual([]);
    expect(merged.filters.status).toEqual([]);
  });
});

/**
 * The migration matters more than it looks: everyone with the app open has a
 * persisted `orderBy` in localStorage. Getting this wrong silently resets every
 * saved view to Manual.
 */
describe("legacy orderBy migration", () => {
  it("turns manual into an empty sort", () => {
    expect(mergePersistedIssuesView({ orderBy: "manual" }, current).sort).toEqual([]);
  });

  it("turns an absent orderBy into an empty sort", () => {
    expect(mergePersistedIssuesView({}, current).sort).toEqual([]);
  });

  it("turns each legacy key into one descending level", () => {
    for (const key of ["priority", "created", "updated"] as const) {
      expect(mergePersistedIssuesView({ orderBy: key }, current).sort).toEqual([
        { key, dir: "desc" },
      ]);
    }
  });

  it("folds a persisted spreadsheet sort into the shared list", () => {
    const merged = mergePersistedIssuesView(
      { spreadsheetSort: { column: "target_date", dir: "asc" } },
      current,
    );
    expect(merged.sort).toEqual([{ key: "due", dir: "asc" }]);
  });

  it("drops a spreadsheet sort on a column with no sort key", () => {
    const merged = mergePersistedIssuesView(
      { spreadsheetSort: { column: "labels", dir: "asc" } },
      current,
    );
    expect(merged.sort).toEqual([]);
  });

  it("leaves an already-migrated sort untouched", () => {
    const sort = [{ key: "title" as const, dir: "asc" as const }];
    expect(mergePersistedIssuesView({ sort }, current).sort).toEqual(sort);
  });
});

describe("migrateIssuesView", () => {
  it("maps a v0 showSubIssues to hierarchy whatever it held", () => {
    // v0's `true` meant "draw chevrons", not "list sub-items as rows" — taking
    // it at face value would flatten a list the user only ever saw nested.
    for (const stored of [true, false]) {
      const out = migrateIssuesView({ showSubIssues: stored }, 0) as { showSubIssues: boolean };
      expect(out.showSubIssues).toBe(false);
    }
  });

  it("keeps the rest of the v0 state", () => {
    const out = migrateIssuesView({ layout: "kanban", orderBy: "created" }, 0) as Record<
      string,
      unknown
    >;
    expect(out).toMatchObject({ layout: "kanban", orderBy: "created" });
  });

  it("leaves current-version state alone, including an opt-in to flat", () => {
    const state = { showSubIssues: true, sort: [] };
    expect(migrateIssuesView(state, ISSUES_VIEW_VERSION)).toBe(state);
  });
});

describe("sort actions", () => {
  beforeEach(() => {
    useIssuesViewStore.getState().clearSort();
  });

  it("adds a level with the key's natural direction", () => {
    useIssuesViewStore.getState().addSortLevel("priority");
    useIssuesViewStore.getState().addSortLevel("title");
    expect(useIssuesViewStore.getState().sort).toEqual([
      { key: "priority", dir: "desc" },
      { key: "title", dir: "asc" },
    ]);
  });

  it("refuses a fourth level", () => {
    const s = useIssuesViewStore.getState();
    s.addSortLevel("priority");
    s.addSortLevel("due");
    s.addSortLevel("title");
    s.addSortLevel("status");
    expect(useIssuesViewStore.getState().sort).toHaveLength(3);
  });

  it("never stacks the same key twice", () => {
    const s = useIssuesViewStore.getState();
    s.addSortLevel("priority");
    s.addSortLevel("priority");
    expect(useIssuesViewStore.getState().sort).toHaveLength(1);
  });

  it("flips one level's direction in place", () => {
    const s = useIssuesViewStore.getState();
    s.addSortLevel("due");
    s.flipSortDir(0);
    expect(useIssuesViewStore.getState().sort[0]).toEqual({ key: "due", dir: "desc" });
  });

  it("swaps a level's key, keeping its direction", () => {
    const s = useIssuesViewStore.getState();
    s.addSortLevel("due");
    s.setSortLevelKey(0, "start");
    expect(useIssuesViewStore.getState().sort[0]).toEqual({ key: "start", dir: "asc" });
  });

  it("removes one level and leaves the rest in order", () => {
    const s = useIssuesViewStore.getState();
    s.addSortLevel("priority");
    s.addSortLevel("due");
    s.removeSortLevel(0);
    expect(useIssuesViewStore.getState().sort).toEqual([{ key: "due", dir: "asc" }]);
  });

  it("reorders levels", () => {
    const s = useIssuesViewStore.getState();
    s.addSortLevel("priority");
    s.addSortLevel("due");
    s.reorderSortLevels(1, 0);
    expect(useIssuesViewStore.getState().sort.map((l) => l.key)).toEqual(["due", "priority"]);
  });
});
