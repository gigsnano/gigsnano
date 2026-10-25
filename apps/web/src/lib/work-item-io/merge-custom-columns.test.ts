import { describe, expect, it } from "vitest";
import { mergeCustomFieldColumns } from "./merge-custom-columns";

const base = [
  { key: "code", label: "Code" },
  { key: "title", label: "Title" },
];

describe("mergeCustomFieldColumns", () => {
  it("appends one column per custom field definition, in order", () => {
    const defs = [
      { id: "1", name: "Effort" },
      { id: "2", name: "Team" },
    ];
    expect(mergeCustomFieldColumns(base, defs)).toEqual([
      ...base,
      { key: "cf:1", label: "Effort" },
      { key: "cf:2", label: "Team" },
    ]);
  });

  it("dedups by key when a def's derived key already exists in base", () => {
    const clashingBase = [...base, { key: "cf:1", label: "Existing" }];
    const defs = [
      { id: "1", name: "Effort" },
      { id: "2", name: "Team" },
    ];
    expect(mergeCustomFieldColumns(clashingBase, defs)).toEqual([
      ...clashingBase,
      { key: "cf:2", label: "Team" },
    ]);
  });

  it("returns base unchanged when defs is empty", () => {
    expect(mergeCustomFieldColumns(base, [])).toEqual(base);
  });
});
