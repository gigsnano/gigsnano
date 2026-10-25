import { describe, it, expect } from "vitest";

import {
  WORK_ITEM_FIELDS,
  FIELD_CATEGORY_ORDER,
  TEXT_OPERATORS,
  SELECT_OPERATORS,
  DATE_OPERATORS,
  filterableFields,
  columnFields,
  gigsqlFieldSets,
  gigsqlColonAliases,
  viewFilterFields,
  fieldByKey,
} from "./field-registry";
import { VIEW_FILTER_FIELDS } from "@/lib/views/filter-query";
import { SPREADSHEET_COLUMN_META } from "./spreadsheet-columns";

describe("field-registry integrity", () => {
  it("has unique canonical keys", () => {
    const keys = WORK_ITEM_FIELDS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every field is in a known category and carries type-specific operators", () => {
    for (const f of WORK_ITEM_FIELDS) {
      expect(FIELD_CATEGORY_ORDER).toContain(f.category);
      expect(f.filterOperators.length).toBeGreaterThan(0);
    }
    expect(fieldByKey("title")?.filterOperators).toEqual(TEXT_OPERATORS);
    expect(fieldByKey("status")?.filterOperators).toEqual(SELECT_OPERATORS);
    expect(fieldByKey("target_date")?.filterOperators).toEqual(DATE_OPERATORS);
  });

  it("a filterable field is always reachable by a GigsQL field name", () => {
    for (const f of filterableFields()) {
      expect(f.gigsqlField, `${f.key} filterable but has no gigsqlField`).toBeTruthy();
    }
  });

  it("a GigsQL-valid field always declares its value grammar", () => {
    for (const f of WORK_ITEM_FIELDS) {
      if (f.gigsqlField) expect(f.gigsqlValueKind, `${f.key} missing gigsqlValueKind`).toBeTruthy();
    }
  });
});

describe("field-registry is the single source of truth (anti-divergence)", () => {
  it("derives the exact canonical GigsQL work-item field set", () => {
    const { all, select, text, date } = gigsqlFieldSets();
    expect([...all].sort()).toEqual(
      [
        "assignee",
        "createdAt",
        "cycle",
        "dueDate",
        "label",
        "module",
        "priority",
        "startDate",
        "status",
        "title",
        "type",
        "updatedAt",
      ].sort(),
    );
    expect([...select].sort()).toEqual(
      ["assignee", "cycle", "label", "module", "priority", "status", "type"].sort(),
    );
    expect([...text]).toEqual(["title"]);
    expect([...date].sort()).toEqual(["createdAt", "dueDate", "startDate", "updatedAt"].sort());
  });

  it("derives the colon-shorthand aliases (due→dueDate, created→createdAt)", () => {
    expect(gigsqlColonAliases()).toEqual({ due: "dueDate", created: "createdAt" });
  });

  it("derives the saved-View filter_query allow-list (no `type`)", () => {
    const derived = viewFilterFields().sort();
    expect(derived).toEqual([...VIEW_FILTER_FIELDS].sort());
    expect(derived).not.toContain("type");
  });

  it("derives every spreadsheet column key from the registry (no orphans either way)", () => {
    const registryColumnKeys = columnFields()
      .map((f) => f.columnKey)
      .sort();
    const spreadsheetKeys = Object.keys(SPREADSHEET_COLUMN_META).sort();
    expect(registryColumnKeys).toEqual(spreadsheetKeys);
  });
});
