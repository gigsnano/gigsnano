import { describe, expect, it } from "vitest";

import { ADMIN_EMPTY } from "./admin-empty";

describe("ADMIN_EMPTY", () => {
  it("has copy for each placeholder module with a title + action label", () => {
    for (const key of ["workspaces", "marketplace"] as const) {
      expect(ADMIN_EMPTY[key].title).toBeTruthy();
      expect(ADMIN_EMPTY[key].actionLabel).toBeTruthy();
    }
  });
});
