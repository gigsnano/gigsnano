// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { INotification } from "@/types";
import { ENotificationKind } from "@/types";

// ---- controllable module state ----
let searchParams = new URLSearchParams();
const replace = vi.fn();

let listReturn: {
  data?: { items: INotification[]; total: number; limit: number; offset: number };
  isPending: boolean;
  isError: boolean;
  refetch: () => void;
};
let unreadTotal = 0;
const markReadMutate = vi.fn();
const markAllMutate = vi.fn();
const refetch = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/acme/notifications",
  useSearchParams: () => searchParams,
}));

vi.mock("@/hooks/workspace/use-notifications", () => ({
  useNotifications: () => listReturn,
  useUnreadNotifications: () => ({ data: { total_unread: unreadTotal, mention_unread: 0 } }),
  useMarkNotificationRead: () => ({ mutate: markReadMutate, isPending: false }),
  useMarkAllNotificationsRead: () => ({ mutate: markAllMutate, isPending: false }),
}));

vi.mock("@/components/layout", () => ({
  AppHeader: ({ actions }: { actions?: React.ReactNode }) => <div>{actions}</div>,
  ContentWrapper: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/workspace/pending-invite-banner", () => ({
  PendingInviteBanner: () => null,
}));

import { Inbox } from "./inbox";

function note(overrides: Partial<INotification> = {}): INotification {
  return {
    id: "n1",
    workspace_slug: "acme",
    kind: ENotificationKind.Mention,
    title: "Grace mentioned you",
    body: "Review the PRD",
    href: "/acme/docs/d1",
    read: false,
    created_at: new Date().toISOString(),
    actor: null,
    project: null,
    ...overrides,
  };
}

function listData(items: INotification[], total = items.length) {
  return { data: { items, total, limit: 20, offset: 0 }, isPending: false, isError: false, refetch };
}

beforeEach(() => {
  searchParams = new URLSearchParams();
  unreadTotal = 0;
  replace.mockClear();
  markReadMutate.mockClear();
  markAllMutate.mockClear();
  refetch.mockClear();
  listReturn = listData([note()]);
});

afterEach(() => cleanup());

describe("Inbox", () => {
  it("labels the page 'Inbox' and shows the unread count when > 0", () => {
    unreadTotal = 3;
    render(<Inbox workspaceSlug="acme" />);
    expect(screen.getByRole("heading", { name: "Inbox" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Inbox" })).toBeInTheDocument();
    expect(screen.getByLabelText("3 unread")).toHaveTextContent("3");
  });

  it("selecting a filter tab writes it to the URL", () => {
    render(<Inbox workspaceSlug="acme" />);
    fireEvent.click(screen.getByRole("tab", { name: "Unread" }));
    expect(replace).toHaveBeenCalledWith("/acme/notifications?filter=unread", { scroll: false });
  });

  it("Mark all read is disabled with no unread, enabled otherwise", () => {
    const { rerender } = render(<Inbox workspaceSlug="acme" />);
    expect(screen.getByRole("button", { name: /mark all read/i })).toBeDisabled();

    unreadTotal = 2;
    rerender(<Inbox workspaceSlug="acme" />);
    const btn = screen.getByRole("button", { name: /mark all read/i });
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    expect(markAllMutate).toHaveBeenCalledTimes(1);
  });

  it("selecting a row marks it read and opens it in the detail pane", () => {
    render(<Inbox workspaceSlug="acme" />);
    fireEvent.click(screen.getByRole("button", { name: /grace mentioned you/i }));
    expect(markReadMutate).toHaveBeenCalledWith(
      { id: "n1", read: true },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
    // Detail pane now shows the selected item's Open action pointing at its href.
    const openLinks = screen.getAllByRole("link", { name: /open/i });
    expect(openLinks[0]).toHaveAttribute("href", "/acme/docs/d1");
  });

  it("shows the caught-up empty state when there are no notifications", () => {
    listReturn = listData([], 0);
    render(<Inbox workspaceSlug="acme" />);
    expect(screen.getByText(/you're all caught up/i)).toBeInTheDocument();
  });

  it("shows a filtered-empty state with Clear filters, which resets the URL", () => {
    searchParams = new URLSearchParams("filter=mentions");
    listReturn = listData([], 0);
    render(<Inbox workspaceSlug="acme" />);
    const clear = screen.getByRole("button", { name: /clear filters/i });
    fireEvent.click(clear);
    expect(replace).toHaveBeenCalledWith("/acme/notifications", { scroll: false });
  });

  it("shows an error state with a working Retry", () => {
    listReturn = { data: undefined, isPending: false, isError: true, refetch };
    render(<Inbox workspaceSlug="acme" />);
    expect(screen.getByText(/couldn't load your inbox/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it("renders a loading skeleton without content while pending", () => {
    listReturn = { data: undefined, isPending: true, isError: false, refetch };
    render(<Inbox workspaceSlug="acme" />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByText(/you're all caught up/i)).toBeNull();
  });
});
