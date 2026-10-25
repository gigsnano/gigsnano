import { describe, expect, it } from "vitest";

import type { IValidationResult, IViolation } from "@/types/project/foundation";
import { blockingCount, groupViolationsByFile } from "./violations";

const v = (file: string, rule = "no-hardcoded-color", blocking = true): IViolation => ({
  rule,
  file,
  line: 1,
  blocking,
  detail: "x",
});

describe("groupViolationsByFile", () => {
  it("groups by file preserving first-seen order", () => {
    const groups = groupViolationsByFile([v("a.tsx"), v("b.tsx"), v("a.tsx")]);
    expect(groups.map((g) => g.file)).toEqual(["a.tsx", "b.tsx"]);
    expect(groups[0].items).toHaveLength(2);
  });

  it("puts repo-level (empty file) group last", () => {
    const groups = groupViolationsByFile([v(""), v("a.tsx")]);
    expect(groups.map((g) => g.file)).toEqual(["a.tsx", ""]);
  });
});

describe("blockingCount", () => {
  it("counts only blocking violations", () => {
    const result: IValidationResult = {
      status: "fail",
      violations: [v("a.tsx"), v("b.tsx", "unapproved-library", false)],
    };
    expect(blockingCount(result)).toBe(1);
  });
});
