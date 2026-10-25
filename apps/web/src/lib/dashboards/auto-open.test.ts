import { describe, expect, it } from "vitest";

import { autoOpenDashboardId } from "./auto-open";

const d = (id: string) => ({ id });

describe("autoOpenDashboardId", () => {
  it("opens the dashboard when it is the only one", () => {
    expect(autoOpenDashboardId([d("a")], false)).toBe("a");
  });

  it("shows the directory when there is a choice to make", () => {
    expect(autoOpenDashboardId([d("a"), d("b")], false)).toBeNull();
  });

  it("shows the directory when there is nothing to open", () => {
    expect(autoOpenDashboardId([], false)).toBeNull();
  });

  it("waits rather than guessing while the list is loading", () => {
    // Redirecting off an undefined list would bounce the user somewhere before
    // we know whether there is anywhere to bounce them to.
    expect(autoOpenDashboardId(undefined, false)).toBeNull();
  });

  it("stays on the directory when the user asked to browse", () => {
    // Otherwise the one dashboard becomes a trap: every route back to the list
    // bounces straight into it, and there is no way to reach New dashboard.
    expect(autoOpenDashboardId([d("a")], true)).toBeNull();
  });
});
