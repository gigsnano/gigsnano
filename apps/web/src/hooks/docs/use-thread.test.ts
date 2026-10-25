import { describe, expect, it } from "vitest";

import { APIError } from "@/services/api-error";
import { isLockedThreadError, isNonLlmThreadError } from "./use-thread";

describe("isLockedThreadError", () => {
  it("is true for a 409 whose detail says the story is locked", () => {
    const err = new APIError(409, "POST .../thread/ failed with 409", {
      detail: "Story is locked by BMAD dependencies",
    });
    expect(isLockedThreadError(err)).toBe(true);
  });

  it("is false for the other thread-open 409 (epic already broken down)", () => {
    const err = new APIError(409, "failed", { detail: "epic_already_broken_down" });
    expect(isLockedThreadError(err)).toBe(false);
  });

  it("is false for a 422 non-LLM step", () => {
    const err = new APIError(422, "failed", { detail: "non-llm step" });
    expect(isLockedThreadError(err)).toBe(false);
    expect(isNonLlmThreadError(err)).toBe(true);
  });

  it("is false for a non-APIError", () => {
    expect(isLockedThreadError(new Error("boom"))).toBe(false);
    expect(isLockedThreadError(null)).toBe(false);
  });
});
