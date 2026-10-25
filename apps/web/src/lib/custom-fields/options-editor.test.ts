import { describe, it, expect } from "vitest";

import {
  addOption,
  removeOption,
  moveOption,
  toOptionValues,
  fromOptionValues,
} from "./options-editor";

describe("addOption", () => {
  it("appends a trimmed option", () => {
    const next = addOption([{ id: "1", value: "A" }], { id: "2", value: "  B  " });
    expect(toOptionValues(next)).toEqual(["A", "B"]);
  });

  it("ignores blank input", () => {
    const options = [{ id: "1", value: "A" }];
    expect(addOption(options, { id: "2", value: "   " })).toBe(options);
    expect(addOption(options, { id: "2", value: "" })).toBe(options);
  });

  it("does not mutate the input array", () => {
    const options = [{ id: "1", value: "A" }];
    const next = addOption(options, { id: "2", value: "B" });
    expect(options).toHaveLength(1);
    expect(next).toHaveLength(2);
  });
});

describe("removeOption", () => {
  const options = [
    { id: "1", value: "A" },
    { id: "2", value: "B" },
    { id: "3", value: "C" },
  ];

  it("removes the option with the given id", () => {
    expect(toOptionValues(removeOption(options, "2"))).toEqual(["A", "C"]);
  });

  it("is a no-op when the id isn't present", () => {
    expect(removeOption(options, "missing")).toEqual(options);
  });
});

describe("moveOption", () => {
  const options = [
    { id: "1", value: "A" },
    { id: "2", value: "B" },
    { id: "3", value: "C" },
  ];

  it("moves an option up", () => {
    expect(toOptionValues(moveOption(options, "2", "up"))).toEqual(["B", "A", "C"]);
  });

  it("moves an option down", () => {
    expect(toOptionValues(moveOption(options, "2", "down"))).toEqual(["A", "C", "B"]);
  });

  it("keeps stable ids across a reorder (no key churn)", () => {
    const next = moveOption(options, "2", "up");
    expect(next.map((o) => o.id)).toEqual(["2", "1", "3"]);
  });

  it("is a no-op at the top boundary", () => {
    expect(moveOption(options, "1", "up")).toEqual(options);
  });

  it("is a no-op at the bottom boundary", () => {
    expect(moveOption(options, "3", "down")).toEqual(options);
  });

  it("is a no-op when the id isn't present", () => {
    expect(moveOption(options, "missing", "up")).toEqual(options);
  });
});

describe("fromOptionValues / toOptionValues", () => {
  it("round-trips plain string options", () => {
    const values = ["Low", "Medium", "High"];
    expect(toOptionValues(fromOptionValues(values))).toEqual(values);
  });

  it("assigns a distinct id per seeded option", () => {
    const drafts = fromOptionValues(["Low", "Medium"]);
    expect(new Set(drafts.map((d) => d.id)).size).toBe(2);
  });
});
