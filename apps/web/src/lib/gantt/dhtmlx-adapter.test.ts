import { describe, it, expect } from "vitest";

import {
  storiesToGanttData,
  storyToTask,
  taskToDatePatch,
  inclusiveDuration,
  addDays,
  toDayString,
  isScheduled,
  isDueBeforeStart,
  relationsToLinks,
  isTaskOverdue,
  earliestStartMs,
} from "./dhtmlx-adapter";
import { EStoryStatus, EStoryPriority, EStoryRelationType, type IStory } from "@/types";

function story(overrides: Partial<IStory>): IStory {
  return {
    id: "s1",
    workspace_slug: "acme",
    project_id: "p1",
    cycle_id: null,
    module_id: null,
    parent_id: null,
    title: "Do the thing",
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
  } as IStory;
}

const code = (s: IStory) => `WEB-${s.id}`;

describe("date helpers", () => {
  it("inclusiveDuration counts both endpoints (min 1)", () => {
    expect(inclusiveDuration("2026-03-01", "2026-03-01")).toBe(1);
    expect(inclusiveDuration("2026-03-01", "2026-03-05")).toBe(5);
    expect(inclusiveDuration("2026-03-05", "2026-03-01")).toBe(1); // never < 1
  });
  it("addDays crosses month boundaries", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("toDayString trims datetimes and rejects junk", () => {
    expect(toDayString("2026-03-01T12:00:00Z")).toBe("2026-03-01");
    expect(toDayString("nope")).toBeNull();
    expect(toDayString(null)).toBeNull();
  });
});

describe("isDueBeforeStart", () => {
  it("only rejects when BOTH dates are present and due precedes start", () => {
    expect(isDueBeforeStart("2026-03-05", "2026-03-01")).toBe(true);
    expect(isDueBeforeStart("2026-03-01", "2026-03-05")).toBe(false);
    expect(isDueBeforeStart("2026-03-01", "2026-03-01")).toBe(false); // equal is valid
    expect(isDueBeforeStart(null, "2026-03-01")).toBe(false); // due-only: nothing to invert
    expect(isDueBeforeStart("2026-03-01", null)).toBe(false); // start-only
    expect(isDueBeforeStart(null, null)).toBe(false);
  });
});

describe("storyToTask", () => {
  it("maps a fully-scheduled story to a dhtmlx task", () => {
    const t = storyToTask(
      story({ id: "a", title: "Build", start_date: "2026-03-02", target_date: "2026-03-06", status: EStoryStatus.InProgress }),
      "WEB-1",
    );
    expect(t).toMatchObject({
      id: "a",
      text: "WEB-1 Build",
      start_date: "2026-03-02",
      duration: 5,
      progress: 0.5,
      parent: 0,
      gn_unscheduled_end: false,
    });
  });

  it("carries the grid-column fields (title, due, resolved assignee)", () => {
    const t = storyToTask(
      story({ start_date: "2026-03-02", target_date: "2026-03-06", title: "Build", assignee_id: "u1" }),
      "WEB-1",
      "Ada Lovelace",
    );
    expect(t).toMatchObject({ gn_title: "Build", gn_due: "2026-03-06", gn_assignee: "Ada Lovelace", gn_assignee_id: "u1" });
  });

  it("a single date makes a 1-day marker, flagged (never invents a range)", () => {
    const t = storyToTask(story({ id: "a", start_date: "2026-03-02" }), "WEB-1");
    expect(t?.duration).toBe(1);
    expect(t?.gn_unscheduled_end).toBe(true);
  });

  it("an unscheduled story is not a task (backlog)", () => {
    expect(storyToTask(story({ id: "a" }), "WEB-1")).toBeNull();
    expect(isScheduled(story({ id: "a" }))).toBe(false);
  });

  it("progress falls back to status", () => {
    expect(storyToTask(story({ start_date: "2026-03-02", status: EStoryStatus.Done }), "c")?.progress).toBe(1);
    expect(storyToTask(story({ start_date: "2026-03-02", status: EStoryStatus.Todo }), "c")?.progress).toBe(0);
  });
});

describe("storiesToGanttData", () => {
  it("keeps only scheduled stories and reparents orphans to root", () => {
    const stories = [
      story({ id: "epic", start_date: "2026-03-01", target_date: "2026-03-10" }),
      story({ id: "child", parent_id: "epic", start_date: "2026-03-02", target_date: "2026-03-04" }),
      story({ id: "orphan", parent_id: "ghost", start_date: "2026-03-02", target_date: "2026-03-04" }),
      story({ id: "backlog" }), // unscheduled → dropped
    ];
    const { data, links } = storiesToGanttData(stories, code);
    expect(data.map((t) => t.id)).toEqual(["epic", "child", "orphan"]);
    expect(data.find((t) => t.id === "child")?.parent).toBe("epic");
    expect(data.find((t) => t.id === "orphan")?.parent).toBe(0); // ghost parent → root
    expect(links).toEqual([]);
  });
});

describe("relationsToLinks", () => {
  const ids = new Set(["a", "b", "c"]);
  it("draws blocking solid and relates/duplicate dashed; blocked_by stays the skipped mirror", () => {
    const links = relationsToLinks(
      [
        { story_id: "a", related_story_id: "b", relation_type: EStoryRelationType.Blocks },
        { story_id: "b", related_story_id: "a", relation_type: EStoryRelationType.BlockedBy },
        { story_id: "a", related_story_id: "c", relation_type: EStoryRelationType.RelatesTo },
      ],
      ids,
    );
    expect(links).toEqual([
      { id: "a->b", source: "a", target: "b", type: "0", gn_kind: "blocking" },
      { id: "related:a|c", source: "a", target: "c", type: "0", gn_kind: "related" },
    ]);
  });

  it("treats a symmetric relation as ONE edge however it is stored", () => {
    // relates_to has no direction, so a->c and c->a are the same association;
    // drawing both would put two dashed lines between the same pair of bars.
    const links = relationsToLinks(
      [
        { story_id: "a", related_story_id: "c", relation_type: EStoryRelationType.RelatesTo },
        { story_id: "c", related_story_id: "a", relation_type: EStoryRelationType.RelatesTo },
        { story_id: "a", related_story_id: "c", relation_type: EStoryRelationType.Duplicate },
      ],
      ids,
    );
    expect(links).toHaveLength(1);
    expect(links[0].gn_kind).toBe("related");
  });

  it("lets a dependency win over a relation on the same pair", () => {
    // Both blocking AND related: the dependency is the stronger statement, and a
    // dashed line beside a solid arrow says nothing extra.
    const links = relationsToLinks(
      [
        { story_id: "a", related_story_id: "b", relation_type: EStoryRelationType.RelatesTo },
        { story_id: "a", related_story_id: "b", relation_type: EStoryRelationType.Blocks },
      ],
      ids,
    );
    expect(links).toEqual([
      { id: "a->b", source: "a", target: "b", type: "0", gn_kind: "blocking" },
    ]);
  });

  it("keeps both directions of a blocking pair — direction is meaningful there", () => {
    const links = relationsToLinks(
      [
        { story_id: "a", related_story_id: "b", relation_type: EStoryRelationType.Blocks },
        { story_id: "b", related_story_id: "a", relation_type: EStoryRelationType.Blocks },
      ],
      ids,
    );
    expect(links.map((l) => l.id)).toEqual(["a->b", "b->a"]);
  });

  it("drops a dashed edge that would dangle off an unrendered task", () => {
    const links = relationsToLinks(
      [{ story_id: "a", related_story_id: "z", relation_type: EStoryRelationType.RelatesTo }],
      ids,
    );
    expect(links).toEqual([]);
  });

  it("drops edges whose endpoints aren't both rendered tasks (no dangling arrows)", () => {
    const links = relationsToLinks(
      [{ story_id: "a", related_story_id: "z", relation_type: EStoryRelationType.Blocks }],
      ids,
    );
    expect(links).toEqual([]);
  });

  it("dedupes duplicate blocking edges", () => {
    const links = relationsToLinks(
      [
        { story_id: "a", related_story_id: "b", relation_type: EStoryRelationType.Blocks },
        { story_id: "a", related_story_id: "b", relation_type: EStoryRelationType.Blocks },
      ],
      ids,
    );
    expect(links).toHaveLength(1);
  });
});

describe("storiesToGanttData with relations", () => {
  it("emits blocking links between scheduled tasks", () => {
    const stories = [
      story({ id: "a", start_date: "2026-03-01", target_date: "2026-03-03" }),
      story({ id: "b", start_date: "2026-03-04", target_date: "2026-03-06" }),
    ];
    const { links } = storiesToGanttData(stories, code, () => "", [
      { story_id: "a", related_story_id: "b", relation_type: EStoryRelationType.Blocks },
    ]);
    expect(links).toEqual([
      { id: "a->b", source: "a", target: "b", type: "0", gn_kind: "blocking" },
    ]);
  });
});

describe("taskToDatePatch (inverse)", () => {
  it("converts dhtmlx exclusive end_date back to an inclusive due date", () => {
    // A bar 2026-03-02 → end_date 2026-03-07 (exclusive) is a due date of 03-06.
    expect(taskToDatePatch({ start_date: "2026-03-02", end_date: "2026-03-07" })).toEqual({
      start_date: "2026-03-02",
      target_date: "2026-03-06",
    });
  });
  it("accepts Date objects", () => {
    expect(
      taskToDatePatch({ start_date: new Date(Date.UTC(2026, 2, 2)), end_date: new Date(Date.UTC(2026, 2, 3)) }),
    ).toEqual({ start_date: "2026-03-02", target_date: "2026-03-02" });
  });
});

describe("storiesToGanttData nesting", () => {
  const dated = { start_date: "2026-03-01", target_date: "2026-03-05" };
  const parent = story({ id: "p", ...dated, sub_issue_count: 1 });
  const child = story({ id: "c", parent_id: "p", ...dated });
  const code = (s: IStory) => s.id.toUpperCase();

  it("keeps the parent link so dhtmlx can draw the tree", () => {
    const { data } = storiesToGanttData([parent, child], code, () => "", [], true);
    expect(data.find((t) => t.id === "c")?.parent).toBe("p");
  });

  it("flattens every task to the root when nesting is off", () => {
    const { data } = storiesToGanttData([parent, child], code, () => "", [], false);
    expect(data.map((t) => t.parent)).toEqual([0, 0]);
  });

  it("still reparents an orphan to the root when nesting is on", () => {
    const orphan = story({ id: "o", parent_id: "gone", ...dated });
    const { data } = storiesToGanttData([orphan], code, () => "", [], true);
    expect(data[0]!.parent).toBe(0);
  });
});

describe("isTaskOverdue", () => {
  const base = { gn_due: "2026-07-10", gn_status: EStoryStatus.InProgress, gn_unscheduled_end: false };

  it("flags a past due date on unfinished work", () => {
    expect(isTaskOverdue(base, "2026-07-22")).toBe(true);
  });

  it("does not flag work that is done", () => {
    expect(isTaskOverdue({ ...base, gn_status: EStoryStatus.Done }, "2026-07-22")).toBe(false);
  });

  it("does not flag today itself — the day isn't over", () => {
    expect(isTaskOverdue(base, "2026-07-10")).toBe(false);
  });

  it("does not flag an item with no due date — nothing was promised", () => {
    expect(isTaskOverdue({ ...base, gn_due: null, gn_unscheduled_end: true }, "2026-07-22")).toBe(
      false,
    );
  });
});

describe("earliestStartMs", () => {
  const at = (day: string) => Date.parse(`${day}T00:00:00Z`);

  it("finds the earliest start from pre-parse date strings", () => {
    const tasks = [{ start_date: "2026-03-10" }, { start_date: "2026-03-02" }];
    expect(earliestStartMs(tasks)).toBe(at("2026-03-02"));
  });

  it("finds the earliest start AFTER gantt.parse() has swapped strings for Dates", () => {
    // The regression: gantt.parse() mutates each task in place, so the array
    // React handed in comes back holding Date objects. Passing one of those to
    // dhtmlx's str_to_date threw "t.match is not a function" and blanked the page.
    const tasks = [
      { start_date: new Date(Date.UTC(2026, 2, 10)) },
      { start_date: new Date(Date.UTC(2026, 2, 2)) },
    ];
    expect(earliestStartMs(tasks)).toBe(at("2026-03-02"));
  });

  it("orders Dates chronologically, not by their string form", () => {
    // Sorting the raw values would compare "Fri Jul 03 2026" against
    // "Mon Apr 06 2026" alphabetically and pick July as the earliest.
    const tasks = [
      { start_date: new Date(Date.UTC(2026, 6, 3)) },
      { start_date: new Date(Date.UTC(2026, 3, 6)) },
    ];
    expect(earliestStartMs(tasks)).toBe(at("2026-04-06"));
  });

  it("handles a mixed set (some parsed, some not) without preferring either shape", () => {
    const tasks = [
      { start_date: "2026-05-20" },
      { start_date: new Date(Date.UTC(2026, 0, 15)) },
    ];
    expect(earliestStartMs(tasks)).toBe(at("2026-01-15"));
  });

  it("returns null for an empty set so callers can skip instead of scrolling to epoch", () => {
    expect(earliestStartMs([])).toBeNull();
  });
});
