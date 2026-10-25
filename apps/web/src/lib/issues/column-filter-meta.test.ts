import { describe, it, expect } from "vitest";

import {
  getColumnFilterMeta,
  isFilterableColumn,
  TITLE_FILTER_META,
} from "./column-filter-meta";

describe("column-filter-meta", () => {
  it("maps filterable spreadsheet columns to GigsQL field meta", () => {
    expect(getColumnFilterMeta("status")).toEqual({
      key: "status",
      label: "Status",
      kind: "multi",
    });
    expect(getColumnFilterMeta("target_date")).toEqual({
      key: "due",
      label: "Due date",
      kind: "dateRange",
    });
    expect(getColumnFilterMeta("created_at")).toEqual({
      key: "created",
      label: "Created",
      kind: "dateRange",
    });
    expect(getColumnFilterMeta("type")).toEqual({
      key: "type",
      label: "Type",
      kind: "multi",
    });
  });

  it("returns null for non-filterable columns", () => {
    expect(getColumnFilterMeta("estimate")).toBeNull();
    expect(isFilterableColumn("estimate")).toBe(false);
    expect(isFilterableColumn("type")).toBe(true);
    expect(isFilterableColumn("status")).toBe(true);
  });

  it("exposes title sticky column meta", () => {
    expect(TITLE_FILTER_META).toEqual({
      key: "title",
      label: "Work item",
      kind: "text",
    });
  });
});
