import type { IInbox, IInboxItem, TInboxKind } from "../types/inbox";

export type TInboxSection = "approvals" | "escalations" | "assigned";

const SECTION_OF: Record<TInboxKind, TInboxSection> = {
  director_action: "approvals",
  recovery_plan: "approvals",
  delegation_review: "approvals",
  escalation: "escalations",
  assignment: "assigned",
  mention: "assigned",
};

export const INBOX_SECTIONS: { key: TInboxSection; title: string }[] = [
  { key: "approvals", title: "Approvals" },
  { key: "escalations", title: "Escalations" },
  { key: "assigned", title: "Assigned & mentions" },
];

export function inboxSectionOf(kind: TInboxKind): TInboxSection {
  return SECTION_OF[kind];
}

/** Items bucketed by section, keeping the server order within each. */
export function groupInbox(items: IInboxItem[]): Record<TInboxSection, IInboxItem[]> {
  const out: Record<TInboxSection, IInboxItem[]> = { approvals: [], escalations: [], assigned: [] };
  for (const item of items) out[SECTION_OF[item.kind]].push(item);
  return out;
}

function bump(inbox: IInbox, item: IInboxItem, by: 1 | -1): IInbox["counts"] {
  const c = inbox.counts;
  const section = SECTION_OF[item.kind];
  return {
    approvals: c.approvals + (section === "approvals" ? by : 0),
    escalations: c.escalations + (section === "escalations" ? by : 0),
    assigned: c.assigned + (section === "assigned" ? by : 0),
    total: c.total + by,
  };
}

/** Optimistic removal; counts follow so the tab badge updates at once. */
export function removeInboxItem(inbox: IInbox, id: string): IInbox {
  const item = inbox.items.find((i) => i.id === id);
  if (!item) return inbox;
  return { items: inbox.items.filter((i) => i.id !== id), counts: bump(inbox, item, -1) };
}

/** Undo of removeInboxItem: puts the item back at (or near) its old index. */
export function restoreInboxItem(inbox: IInbox, item: IInboxItem, index: number): IInbox {
  if (inbox.items.some((i) => i.id === item.id)) return inbox;
  const items = inbox.items.slice();
  items.splice(Math.min(Math.max(index, 0), items.length), 0, item);
  return { items, counts: bump(inbox, item, 1) };
}
