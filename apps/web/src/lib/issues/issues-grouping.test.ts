import { describe, it, expect } from "vitest";

import { assigneeGroupKey, groupStories, filterStories } from "./issues-grouping";
import { EStoryStatus, EStoryPriority, EStoryType, type IStory } from "@/types";
import type { IIssueFilters } from "@/store/ui/issues-view.store";
import { storyTypeOf } from "./story-type";

function makeStory(overrides: Partial<IStory>): IStory {
  return {
    id: "st_1",
    workspace_slug: "acme",
    project_id: "p1",
    cycle_id: null,
    module_id: null,
    parent_id: null,
    title: "t",
    description: "",
    status: EStoryStatus.Todo,
    priority: EStoryPriority.None,
    start_date: null,
    target_date: null,
    order: 0,
    assignee_id: null,
    ai_agent_id: null,
    label_id: null, label_ids: [],
    estimate_id: null,
    estimate_points: null,
    sub_issue_count: 0,
    bmad: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const bmad = (agent: string): IStory["bmad"] => ({
  workflow: "w",
  agent,
  artifact: "a.md",
  is_locked: false,
  is_required: true,
});

describe("assigneeGroupKey", () => {
  it("keys a human-assigned story by its assignee_id", () => {
    expect(assigneeGroupKey(makeStory({ assignee_id: "u1" }))).toBe("u1");
  });

  it("keys a BMAD Sprint-0 card by its agent, not 'unassigned'", () => {
    const key = assigneeGroupKey(makeStory({ bmad: bmad("Analyst Â· Mary") }));
    expect(key).not.toBe("unassigned");
    expect(key).toBe("agent:Analyst Â· Mary");
  });

  it("prefers a human assignee over the agent when both are present", () => {
    const key = assigneeGroupKey(makeStory({ assignee_id: "u1", bmad: bmad("Analyst Â· Mary") }));
    expect(key).toBe("u1");
  });

  it("falls back to 'unassigned' for a manual story with no assignee or agent", () => {
    expect(assigneeGroupKey(makeStory({}))).toBe("unassigned");
  });
});

describe("groupStories (assignee) groups BMAD cards under their agent", () => {
  it("puts each Sprint-0 card in its agent group, none under 'unassigned'", () => {
    const stories = [
      makeStory({ id: "a", order: 0, bmad: bmad("Analyst Â· Mary") }),
      makeStory({ id: "b", order: 1, bmad: bmad("Architect Â· Winston") }),
      makeStory({ id: "c", order: 2, assignee_id: "u1" }),
    ];
    const groups = groupStories(stories, "assignee", []);
    const keys = groups.map((g) => g.key);

    expect(keys).toContain("agent:Analyst Â· Mary");
    expect(keys).toContain("agent:Architect Â· Winston");
    expect(keys).toContain("u1");
    expect(keys).not.toContain("unassigned");
  });
});

describe("groupStories (type)", () => {
  it("buckets by type in STORY_TYPE_ORDER and defaults missing type to Story", () => {
    const stories = [
      makeStory({ id: "a", order: 0, type: EStoryType.Epic }),
      makeStory({ id: "b", order: 1, type: EStoryType.Bug }),
      makeStory({ id: "c", order: 2 }), // undefined -> Story
    ];
    const groups = groupStories(stories, "type", []);
    const keys = groups.map((g) => g.key);
    expect(keys).toEqual([
      EStoryType.Epic, EStoryType.Feature, EStoryType.Story, EStoryType.Task, EStoryType.Bug,
    ]);
    expect(groups.find((g) => g.key === EStoryType.Story)!.stories.map((s) => s.id)).toEqual(["c"]);
    expect(groups.find((g) => g.key === EStoryType.Epic)!.stories.map((s) => s.id)).toEqual(["a"]);
  });
});

describe("filterStories (type facet)", () => {
  it("keeps only stories whose resolved type is selected", () => {
    const stories = [
      makeStory({ id: "a", type: EStoryType.Epic }),
      makeStory({ id: "b", type: EStoryType.Task }),
      makeStory({ id: "c" }), // Story
    ];
    const out = filterStories(stories, {
      status: [], priority: [], assignee: [], label: [], type: [EStoryType.Epic, EStoryType.Story],
      custom: {},
      cycle: [], module: [], title: "", dueFrom: null, dueTo: null, createdFrom: null, createdTo: null,
    });
    expect(out.map((s) => s.id)).toEqual(["a", "c"]);
    expect(out.every((s) => [EStoryType.Epic, EStoryType.Story].includes(storyTypeOf(s)))).toBe(true);
  });
});

/** Minimal-shape story builder for custom-field tests (id + custom_fields only matter). */
function mk(id: string, cf?: Record<string, string | number | null>): IStory {
  return {
    id, status: "todo", priority: "none", assignee_id: null, label_id: null, label_ids: [],
    custom_fields: cf, order: 0,
  } as unknown as IStory;
}

describe("filterStories (custom SELECT facet)", () => {
  const F = (custom: Record<string, string[]>) =>
    ({
      status: [], priority: [], assignee: [], label: [], type: [], custom,
      cycle: [], module: [], title: "", dueFrom: null, dueTo: null, createdFrom: null, createdTo: null,
    }) as IIssueFilters;

  it("honors custom SELECT facet", () => {
    const a = mk("a", { f1: "High" });
    const b = mk("b", { f1: "Low" });
    const c = mk("c", {});
    expect(filterStories([a, b, c], F({ f1: ["High"] })).map((s) => s.id)).toEqual(["a"]);
    expect(filterStories([a, b, c], F({ f1: ["__none__"] })).map((s) => s.id)).toEqual(["c"]);
    expect(filterStories([a, b, c], F({})).length).toBe(3); // empty = no constraint
    expect(filterStories([a, b, c], F({ f1: ["High", "Low"] })).map((s) => s.id)).toEqual(["a", "b"]);
  });
});

describe("filterStories (title + date facets)", () => {
  const base = (): IIssueFilters => ({
    status: [], priority: [], assignee: [], label: [], type: [], custom: {},
    cycle: [], module: [], title: "", dueFrom: null, dueTo: null, createdFrom: null, createdTo: null,
  });

  it("filters by title contains (case-insensitive)", () => {
    const stories = [
      makeStory({ id: "a", title: "Fix login bug" }),
      makeStory({ id: "b", title: "Add dashboard" }),
    ];
    expect(filterStories(stories, { ...base(), title: "login" }).map((s) => s.id)).toEqual(["a"]);
    expect(filterStories(stories, { ...base(), title: "DASH" }).map((s) => s.id)).toEqual(["b"]);
  });

  it("filters by due and created date ranges", () => {
    const stories = [
      makeStory({ id: "a", target_date: "2026-07-10", created_at: "2026-06-01T12:00:00Z" }),
      makeStory({ id: "b", target_date: "2026-07-20", created_at: "2026-07-15T12:00:00Z" }),
      makeStory({ id: "c", target_date: null, created_at: "2026-07-01T12:00:00Z" }),
    ];
    expect(
      filterStories(stories, { ...base(), dueFrom: "2026-07-15", dueTo: "2026-07-31" }).map((s) => s.id),
    ).toEqual(["b"]);
    expect(
      filterStories(stories, { ...base(), createdFrom: "2026-07-01", createdTo: "2026-07-10" }).map(
        (s) => s.id,
      ),
    ).toEqual(["c"]);
    expect(filterStories(stories, { ...base(), dueFrom: "2026-07-01" }).map((s) => s.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("filters by cycle and module facets (GIN-313)", () => {
    const stories = [
      makeStory({ id: "a", cycle_id: "c1", module_id: "m1" }),
      makeStory({ id: "b", cycle_id: "c2", module_id: "m1" }),
      makeStory({ id: "c", cycle_id: null, module_id: null }),
    ];
    expect(filterStories(stories, { ...base(), cycle: ["c1"] }).map((s) => s.id)).toEqual(["a"]);
    expect(filterStories(stories, { ...base(), module: ["m1"] }).map((s) => s.id)).toEqual([
      "a",
      "b",
    ]);
    // Undated/unset rows fall out when the facet is active.
    expect(filterStories(stories, { ...base(), cycle: ["c1", "c2"] }).map((s) => s.id)).toEqual([
      "a",
      "b",
    ]);
  });
});

describe("groupStories (custom SELECT field)", () => {
  it("groups by a cf field using options order + None", () => {
    const a = mk("a", { f1: "High" });
    const b = mk("b", { f1: "Low" });
    const c = mk("c", {});
    const groups = groupStories([a, b, c], "cf:f1" as any, [], ["Low", "High"]);
    expect(groups.map((g) => g.key)).toEqual(["Low", "High", "__none__"]);
    expect(groups.find((g) => g.key === "High")!.stories.map((s) => s.id)).toEqual(["a"]);
    expect(groups.find((g) => g.key === "__none__")!.stories.map((s) => s.id)).toEqual(["c"]);
  });

  it("falls back to a single 'all' group for a stale cf field with no options", () => {
    const a = mk("a", { f1: "High" });
    const b = mk("b", { f1: "Low" });
    const c = mk("c", {});
    expect(groupStories([a, b, c], "cf:gone" as any, []).map((g) => g.key)).toEqual(["all"]);
  });
});

describe("filterStories (multi-label facet, GIN-475)", () => {
  const F = (label: string[]): IIssueFilters =>
    ({
      status: [], priority: [], assignee: [], label, type: [], custom: {},
      cycle: [], module: [], title: "", dueFrom: null, dueTo: null, createdFrom: null, createdTo: null,
    }) as IIssueFilters;

  const bug = makeStory({ id: "bug", label_ids: ["l_bug"] });
  const both = makeStory({ id: "both", label_ids: ["l_bug", "l_urgent"] });
  const none = makeStory({ id: "none", label_ids: [] });
  const all = [bug, both, none];

  it("matches an item that carries the label alongside others", () => {
    // The regression the singular field caused: `both` has l_bug PLUS l_urgent,
    // and an equality check on one label column dropped it.
    expect(filterStories(all, F(["l_bug"])).map((s) => s.id)).toEqual(["bug", "both"]);
  });

  it("treats several selected labels as OR", () => {
    expect(filterStories(all, F(["l_urgent"])).map((s) => s.id)).toEqual(["both"]);
    expect(filterStories(all, F(["l_bug", "l_urgent"])).map((s) => s.id)).toEqual(["bug", "both"]);
  });

  it("'none' selects only unlabelled items", () => {
    expect(filterStories(all, F(["none"])).map((s) => s.id)).toEqual(["none"]);
  });

  it("an empty label filter constrains nothing", () => {
    expect(filterStories(all, F([])).length).toBe(3);
  });
});
