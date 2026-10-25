import { describe, expect, it } from "vitest";

import { CODEBASE_VIEWS, CODEBASE_VIEW_IDS } from "./codebase-views";

describe("CODEBASE_VIEWS", () => {
  it("is the single list behind both the tabs and the ?view= whitelist", () => {
    // The bug this guards: the tab switcher and the `?view=` parser each kept their
    // own copy. "issues" was added to the tabs only, so the tab rendered, set
    // ?view=issues, and the parser — not recognising it — bounced straight back to
    // "overview". A tab you can see and cannot click.
    expect(CODEBASE_VIEW_IDS).toEqual(CODEBASE_VIEWS.map((v) => v.id));
  });

  it("has no duplicate ids", () => {
    expect(new Set(CODEBASE_VIEW_IDS).size).toBe(CODEBASE_VIEW_IDS.length);
  });

  it("keeps overview first — it's the fallback for an unknown ?view=", () => {
    expect(CODEBASE_VIEWS[0].id).toBe("overview");
  });

  it("every view has a label", () => {
    for (const view of CODEBASE_VIEWS) expect(view.label.trim()).not.toBe("");
  });
});
