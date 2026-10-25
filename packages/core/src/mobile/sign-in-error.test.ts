import { describe, expect, it } from "vitest";

import { signInErrorMessage } from "./sign-in-error";

describe("signInErrorMessage", () => {
  it.each([
    [401, undefined, "Email or password is incorrect."],
    [429, undefined, "Too many attempts. Wait a minute and try again."],
    [0, "network", "Can't reach GigsNano. Check your connection."],
    [500, undefined, "Something went wrong. Try again."],
  ])("status %s code %s", (status, code, expected) => {
    expect(signInErrorMessage(status, code)).toBe(expected);
  });
});
