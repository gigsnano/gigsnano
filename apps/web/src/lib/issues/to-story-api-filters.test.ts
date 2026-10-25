import { describe, it, expect } from "vitest";

import {
  isBoundedIssuesScope,
  isFullFetchLayout,
  toStoryApiFilters,
} from "./to-story-api-filters";
import type { IIssueFilters } from "@/store/ui/issues-view.store";
import { EStoryPriority, EStoryStatus } from "@/types";

const emptyFilters: IIssueFilters = {
  status: [],
  priority: [],
  type: [],
  assignee: [],
  label: [],
  cycle: [],
  module: [],
  custom: {},
  title: "",
  dueFrom: null,
  dueTo: null,
  createdFrom: null,
  createdTo: null,
};

describe("isFullFetchLayout", () => {
  it("is true for layouts that group/sort entirely client-side", () => {
    // These need the COMPLETE story set â€” grouping/sorting a server page is wrong.
    expect(isFullFetchLayout("list")).toBe(true);
    expect(isFullFetchLayout("kanban")).toBe(true);
    expect(isFullFetchLayout("spreadsheet")).toBe(true);
  });

  it("is true for gantt, which virtualises instead of paginating (GIN-119)", () => {
    // Being on this path is what removes the pagination footer: `pagination` is
    // only non-null for the paged path.
    expect(isFullFetchLayout("gantt")).toBe(true);
  });

  it("is true for calendar, which places items client-side by the chosen date", () => {
    // Was false: the calendar used to ask the server for a target_date range,
    // which is precisely what made a start-date basis impossible — the API has
    // no start-date filter to ask with.
    expect(isFullFetchLayout("calendar")).toBe(true);
  });
});

describe("isBoundedIssuesScope", () => {
  it("is bounded only when scoped to a cycle", () => {
    expect(isBoundedIssuesScope("cy_1")).toBe(true);
    expect(isBoundedIssuesScope(undefined)).toBe(false);
  });
});

describe("toStoryApiFilters", () => {
  it("no longer scopes calendar by a target_date range", () => {
    // The branch is gone with the full-fetch cutover; placing by date is the
    // view's job now, and scoping by target_date would re-break the start basis.
    const api = toStoryApiFilters({
      layout: "calendar",
      sort: [],
      filters: emptyFilters,
      calendarMonthKey: "2026-07",
    });
    expect(api.target_date_from).toBeUndefined();
    expect(api.target_date_to).toBeUndefined();
  });

  it("does not set scheduled_only for gantt (Plane showAllBlocks)", () => {
    const api = toStoryApiFilters({
      layout: "gantt",
      sort: [],
      filters: emptyFilters,
    });
    expect(api.scheduled_only).toBeUndefined();
  });

  it("sends canonical gigsql instead of structured facet params when filters are active", () => {
    const filters: IIssueFilters = {
      ...emptyFilters,
      status: [EStoryStatus.Todo, EStoryStatus.InProgress],
      priority: [EStoryPriority.High],
    };
    const api = toStoryApiFilters({
      layout: "calendar",
      sort: [],
      filters,
    });
    expect(api.gigsql).toBe("status in (todo, in_progress) AND priority = high");
    expect(api.status).toBeUndefined();
    expect(api.status_in).toBeUndefined();
    expect(api.priority_in).toBeUndefined();
  });

  it("omits gigsql when no column filters are active", () => {
    const api = toStoryApiFilters({
      layout: "calendar",
      sort: [],
      filters: emptyFilters,
    });
    expect(api.gigsql).toBeUndefined();
  });

  it("encodes sort levels as signed keys, in order", () => {
    const api = toStoryApiFilters({
      layout: "calendar",
      sort: [
        { key: "priority", dir: "desc" },
        { key: "due", dir: "asc" },
      ],
      filters: emptyFilters,
    });
    expect(api.order_by).toBe("-priority,target_date");
  });

  it("falls back to manual for an empty sort", () => {
    const api = toStoryApiFilters({ layout: "calendar", sort: [], filters: emptyFilters });
    expect(api.order_by).toBe("manual");
  });

  it("drops keys the API cannot order by rather than sending them", () => {
    const api = toStoryApiFilters({
      layout: "calendar",
      // `subItems` has no server-side equivalent; `due` does.
      sort: [
        { key: "subItems", dir: "desc" },
        { key: "due", dir: "desc" },
      ],
      filters: emptyFilters,
    });
    expect(api.order_by).toBe("-target_date");
  });
});
