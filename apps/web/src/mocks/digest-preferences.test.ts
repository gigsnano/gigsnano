import { describe, it, expect } from "vitest";

import { resolveMock } from "@/mocks";
import { type IDigestPreference } from "@/types";

const PATH = "/workspaces/acme/digests/preferences/";

describe("mock digest preferences", () => {
  it("returns the defaults, then merges a partial PUT", async () => {
    const initial = await resolveMock<IDigestPreference>("GET", PATH);
    expect(initial.enabled).toBe(true);
    expect(initial.timezone).toBe("UTC");
    expect(initial.digest_hour).toBe(8);
    expect(initial.digest_weekdays).toEqual([0, 1, 2, 3, 4, 5, 6]);

    // Partial update — only the timing fields; everything else untouched.
    const updated = await resolveMock<IDigestPreference>("PUT", PATH, {
      timezone: "Asia/Kolkata",
      digest_hour: 9,
      digest_weekdays: [0, 2, 4],
    });
    expect(updated.timezone).toBe("Asia/Kolkata");
    expect(updated.digest_hour).toBe(9);
    expect(updated.digest_weekdays).toEqual([0, 2, 4]);
    expect(updated.channels).toEqual(initial.channels); // unchanged

    // Persisted for the next GET.
    const refetched = await resolveMock<IDigestPreference>("GET", PATH);
    expect(refetched.timezone).toBe("Asia/Kolkata");
    expect(refetched.digest_hour).toBe(9);
  });
});
