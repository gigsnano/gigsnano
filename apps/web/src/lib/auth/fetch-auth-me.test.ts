import { describe, expect, it, vi } from "vitest";

import { APIError } from "@/services/api-error";
import type { IAuthUser } from "@/types";

import { fetchAuthMe } from "./fetch-auth-me";

const user = { id: "u1", email: "a@b.co" } as IAuthUser;

describe("fetchAuthMe", () => {
  it("returns the user on success", async () => {
    await expect(fetchAuthMe(async () => user)).resolves.toBe(user);
  });

  it("maps 401 to null (signed out) so guards agree", async () => {
    await expect(
      fetchAuthMe(async () => {
        throw new APIError(401, "GET /auth/me/ failed with 401");
      }),
    ).resolves.toBeNull();
  });

  it("rethrows non-401 errors", async () => {
    const err = new APIError(500, "boom");
    await expect(
      fetchAuthMe(async () => {
        throw err;
      }),
    ).rejects.toBe(err);
  });

  it("rethrows non-APIError failures", async () => {
    const err = new Error("network");
    await expect(
      fetchAuthMe(async () => {
        throw err;
      }),
    ).rejects.toBe(err);
  });

  it("does not call getMe more than once", async () => {
    const getMe = vi.fn(async () => {
      throw new APIError(401, "unauthorized");
    });
    await fetchAuthMe(getMe);
    expect(getMe).toHaveBeenCalledTimes(1);
  });
});
