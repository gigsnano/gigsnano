import { describe, expect, it } from "vitest";

import { ENotificationKind } from "@/types";

import {
  INBOX_TABS,
  isNotificationCategory,
  notificationMatchesCategory,
} from "./inbox-filters";

const read = (kind: ENotificationKind, isRead: boolean) => ({ kind, read: isRead });

describe("isNotificationCategory", () => {
  it("accepts every tab id and rejects junk", () => {
    for (const t of INBOX_TABS) expect(isNotificationCategory(t.id)).toBe(true);
    expect(isNotificationCategory("nope")).toBe(false);
    expect(isNotificationCategory(null)).toBe(false);
    expect(isNotificationCategory(undefined)).toBe(false);
  });
});

describe("notificationMatchesCategory", () => {
  it("all matches everything", () => {
    expect(notificationMatchesCategory(read(ENotificationKind.System, true), "all")).toBe(true);
  });

  it("unread matches only unread", () => {
    expect(notificationMatchesCategory(read(ENotificationKind.System, false), "unread")).toBe(true);
    expect(notificationMatchesCategory(read(ENotificationKind.System, true), "unread")).toBe(false);
  });

  it("mentions and assigned map to their kinds", () => {
    expect(notificationMatchesCategory(read(ENotificationKind.Mention, false), "mentions")).toBe(true);
    expect(notificationMatchesCategory(read(ENotificationKind.Assignment, false), "mentions")).toBe(false);
    expect(notificationMatchesCategory(read(ENotificationKind.Assignment, false), "assigned")).toBe(true);
  });

  it("agent_system covers agent + system + sprint (GIN-293)", () => {
    expect(notificationMatchesCategory(read(ENotificationKind.Agent, false), "agent_system")).toBe(true);
    expect(notificationMatchesCategory(read(ENotificationKind.System, false), "agent_system")).toBe(true);
    expect(notificationMatchesCategory(read(ENotificationKind.Sprint, false), "agent_system")).toBe(true);
    expect(notificationMatchesCategory(read(ENotificationKind.Mention, false), "agent_system")).toBe(false);
  });

  it("reviews maps to the Review kind (GIN-293 readiness gates)", () => {
    expect(notificationMatchesCategory(read(ENotificationKind.Review, false), "reviews")).toBe(true);
    for (const kind of Object.values(ENotificationKind)) {
      if (kind === ENotificationKind.Review) continue;
      expect(notificationMatchesCategory(read(kind, false), "reviews")).toBe(false);
    }
  });
});
