import { describe, expect, it } from "vitest";

import type { INotification } from "@/types";
import { ENotificationKind } from "@/types";

import { groupByDate } from "./grouping";

function n(id: string, created_at: string): INotification {
  return {
    id,
    workspace_slug: "acme",
    kind: ENotificationKind.System,
    title: id,
    body: "",
    href: null,
    read: false,
    created_at,
    actor: null,
    project: null,
  };
}

// Build timestamps from LOCAL date parts (mid-day, away from any midnight
// boundary) so the local-day bucketing is deterministic in every timezone.
const NOW = new Date(2026, 6, 19, 12, 0, 0);
const at = (...p: [number, number, number, number]) => new Date(...p).toISOString();

describe("groupByDate", () => {
  it("buckets into today / yesterday / earlier relative to now", () => {
    const groups = groupByDate(
      [
        n("a", at(2026, 6, 19, 9)), // today
        n("b", at(2026, 6, 18, 12)), // yesterday
        n("c", at(2026, 6, 1, 12)), // earlier
      ],
      NOW,
    );
    expect(groups.map((g) => g.key)).toEqual(["today", "yesterday", "earlier"]);
    expect(groups[0].items.map((i) => i.id)).toEqual(["a"]);
    expect(groups[1].items.map((i) => i.id)).toEqual(["b"]);
    expect(groups[2].items.map((i) => i.id)).toEqual(["c"]);
  });

  it("drops empty groups so no bare heading renders", () => {
    const groups = groupByDate([n("a", at(2026, 6, 19, 9))], NOW);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("today");
  });

  it("preserves incoming order within a bucket", () => {
    const groups = groupByDate(
      [n("a", at(2026, 6, 19, 11)), n("b", at(2026, 6, 19, 8))],
      NOW,
    );
    expect(groups[0].items.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("returns no groups for an empty list", () => {
    expect(groupByDate([], NOW)).toEqual([]);
  });
});
