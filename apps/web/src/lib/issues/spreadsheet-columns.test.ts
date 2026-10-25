import { describe, it, expect } from "vitest";

import {
  SPREADSHEET_COLUMN_META,
  SPREADSHEET_COLUMN_ORDER,
  DEFAULT_SPREADSHEET_COLUMNS,
  type SpreadsheetColumnKey,
} from "./spreadsheet-columns";

const ALL_KEYS = Object.keys(SPREADSHEET_COLUMN_META) as SpreadsheetColumnKey[];

describe("spreadsheet-columns registry", () => {
  it("orders every meta key exactly once", () => {
    expect([...SPREADSHEET_COLUMN_ORDER].sort()).toEqual([...ALL_KEYS].sort());
    expect(new Set(SPREADSHEET_COLUMN_ORDER).size).toBe(SPREADSHEET_COLUMN_ORDER.length);
  });

  it("has one default column per meta key, in order", () => {
    expect(DEFAULT_SPREADSHEET_COLUMNS.map((c) => c.key)).toEqual(SPREADSHEET_COLUMN_ORDER);
  });

  it("never defaults a column narrower than its minWidth", () => {
    for (const col of DEFAULT_SPREADSHEET_COLUMNS) {
      expect(col.width).toBeGreaterThanOrEqual(SPREADSHEET_COLUMN_META[col.key].minWidth);
    }
  });

  it("defaults created/updated hidden and the rest visible", () => {
    const hidden = DEFAULT_SPREADSHEET_COLUMNS.filter((c) => !c.visible).map((c) => c.key);
    expect(hidden.sort()).toEqual(["created_at", "updated_at"]);
  });
});
