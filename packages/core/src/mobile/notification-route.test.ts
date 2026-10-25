import { describe, expect, it } from "vitest";

import { notificationRoute } from "./notification-route";

describe("notificationRoute", () => {
  it("uses a route that starts with a slash", () => {
    expect(notificationRoute({ route: "/project/p1" })).toBe("/project/p1");
  });
  it("falls back to the inbox", () => {
    expect(notificationRoute({ route: "project/p1" })).toBe("/inbox");
    expect(notificationRoute({ route: 4 })).toBe("/inbox");
    expect(notificationRoute({})).toBe("/inbox");
    expect(notificationRoute(null)).toBe("/inbox");
    expect(notificationRoute(undefined)).toBe("/inbox");
  });
  it("rejects protocol-relative and external-looking routes", () => {
    expect(notificationRoute({ route: "//evil.com" })).toBe("/inbox");
  });
});
