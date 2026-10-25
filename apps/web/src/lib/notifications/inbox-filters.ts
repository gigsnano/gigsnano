import { ENotificationKind, type ENotificationCategory, type INotification } from "@/types";

export interface IInboxTab {
  id: ENotificationCategory;
  label: string;
}

/** Primary Inbox filter tabs (GIN-270), in display order. */
export const INBOX_TABS: IInboxTab[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "mentions", label: "Mentions" },
  { id: "assigned", label: "Assigned" },
  { id: "reviews", label: "Reviews & approvals" },
  { id: "agent_system", label: "Agent & system" },
];

export function isNotificationCategory(v: string | null | undefined): v is ENotificationCategory {
  return !!v && INBOX_TABS.some((t) => t.id === v);
}

/**
 * Tab → notification predicate. Mirrors the server-authoritative mapping in the
 * API's `_category_clauses`; the frontend keeps its own copy ONLY to filter the
 * mock backend and to unit-test the mapping (GIN-293).
 */
export function notificationMatchesCategory(
  n: Pick<INotification, "kind" | "read">,
  category: ENotificationCategory,
): boolean {
  switch (category) {
    case "unread":
      return !n.read;
    case "mentions":
      return n.kind === ENotificationKind.Mention;
    case "assigned":
      return n.kind === ENotificationKind.Assignment;
    case "reviews":
      return n.kind === ENotificationKind.Review;
    case "agent_system":
      return (
        n.kind === ENotificationKind.Agent ||
        n.kind === ENotificationKind.System ||
        n.kind === ENotificationKind.Sprint
      );
    case "all":
    default:
      return true;
  }
}
