import { describe, expect, it } from "vitest";

import { HTTP_METHODS } from "@/services/api.service";

import * as route from "./route";

/**
 * A Next route handler only accepts the methods it exports by name — anything
 * else it 405s itself, before the proxy runs. PUT was missing here, so every
 * PUT died at the edge and digest preferences could never save on prod, while
 * local dev (which talks to :8020 directly, bypassing this route) worked fine.
 * That gap is exactly what made it invisible (GIN-173).
 *
 * Driven off HTTP_METHODS rather than a hardcoded list, so adding a verb to the
 * service's Method union fails here until the route can actually carry it.
 */
describe("/api/[...path] proxy route", () => {
  it.each([...HTTP_METHODS])("exports a %s handler for the service to use", (method) => {
    expect(typeof (route as Record<string, unknown>)[method]).toBe("function");
  });

  it("exports OPTIONS for preflight", () => {
    expect(typeof route.OPTIONS).toBe("function");
  });
});
