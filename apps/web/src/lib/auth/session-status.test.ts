import { describe, expect, it } from "vitest";

import type { IAuthUser } from "@/types";

import { isSignedIn } from "./session-status";

const user = { id: "u1" } as IAuthUser;

describe("isSignedIn", () => {
  it("is true only when settled with a user and no error", () => {
    expect(isSignedIn(user, false, false)).toBe(true);
  });

  it("is false while pending — even if stale data remains", () => {
    expect(isSignedIn(user, true, false)).toBe(false);
  });

  it("is false on error — even if TanStack preserved previous data", () => {
    // This is the AuthGuard↔GuestGuard loop case: isError + stale user.
    expect(isSignedIn(user, false, true)).toBe(false);
  });

  it("is false when signed out (null/undefined data)", () => {
    expect(isSignedIn(null, false, false)).toBe(false);
    expect(isSignedIn(undefined, false, false)).toBe(false);
  });
});
