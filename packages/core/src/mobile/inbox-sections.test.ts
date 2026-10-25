import { describe, expect, it } from "vitest";

import type { IInbox, IInboxItem, TInboxKind } from "../types/inbox";
import { groupInbox, removeInboxItem, restoreInboxItem } from "./inbox-sections";

function item(id: string, kind: TInboxKind): IInboxItem {
  return {
    id, kind, entity_id: id, project_id: "p", project_name: "P", story_id: null, href: null,
    title: id, subtitle: "", created_at: "2026-10-17T00:00:00Z", actions: [],
  };
}

const inbox: IInbox = {
  items: [item("a", "director_action"), item("b", "escalation"), item("c", "mention"), item("d", "recovery_plan")],
  counts: { approvals: 2, escalations: 1, assigned: 1, total: 4 },
};

describe("groupInbox", () => {
  it("buckets by section in server order", () => {
    const g = groupInbox(inbox.items);
    expect(g.approvals.map((i) => i.id)).toEqual(["a", "d"]);
    expect(g.escalations.map((i) => i.id)).toEqual(["b"]);
    expect(g.assigned.map((i) => i.id)).toEqual(["c"]);
  });
});

describe("removeInboxItem / restoreInboxItem", () => {
  it("removes an item and decrements its section and total", () => {
    const next = removeInboxItem(inbox, "d");
    expect(next.items.map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(next.counts).toEqual({ approvals: 1, escalations: 1, assigned: 1, total: 3 });
  });
  it("ignores an unknown id", () => {
    expect(removeInboxItem(inbox, "zzz")).toBe(inbox);
  });
  it("restores at the old index with counts back", () => {
    const removed = removeInboxItem(inbox, "b");
    const back = restoreInboxItem(removed, inbox.items[1], 1);
    expect(back).toEqual(inbox);
  });
  it("does not duplicate an item that is already present", () => {
    expect(restoreInboxItem(inbox, inbox.items[0], 0)).toBe(inbox);
  });
});
