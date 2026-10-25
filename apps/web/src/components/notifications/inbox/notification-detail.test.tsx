// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { INotification } from "@/types";
import { ENotificationKind } from "@/types";
import { TooltipProvider } from "@/components/ui/tooltip";

import { NotificationDetail } from "./notification-detail";

function make(overrides: Partial<INotification> = {}): INotification {
  return {
    id: "n1",
    workspace_slug: "acme",
    kind: ENotificationKind.Mention,
    title: "Grace mentioned you",
    body: "Can you review the PRD section on offline sync?",
    href: "/acme/docs/doc_1",
    read: false,
    created_at: "2026-07-19T09:00:00Z",
    actor: { id: "u2", display_name: "Grace Hopper", avatar_url: null },
    project: { id: "p1", name: "Mobile Banking App" },
    ...overrides,
  };
}

function renderDetail(item: INotification | null, extra: Partial<{ onBack: () => void }> = {}) {
  const onOpen = vi.fn();
  const onToggleRead = vi.fn();
  render(
    <TooltipProvider>
      <NotificationDetail item={item} onOpen={onOpen} onToggleRead={onToggleRead} onBack={extra.onBack} />
    </TooltipProvider>,
  );
  return { onOpen, onToggleRead };
}

afterEach(() => cleanup());

describe("NotificationDetail", () => {
  it("shows an empty prompt when nothing is selected", () => {
    renderDetail(null);
    expect(screen.getByText(/select a notification to read/i)).toBeInTheDocument();
  });

  it("renders the selected notification's title, actor, project, and body", () => {
    renderDetail(make());
    expect(screen.getByRole("heading", { name: /grace mentioned you/i })).toBeInTheDocument();
    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
    expect(screen.getByText("Mobile Banking App")).toBeInTheDocument();
    expect(screen.getByText(/offline sync/i)).toBeInTheDocument();
  });

  it("Open resolves to the destination and fires onOpen", () => {
    const { onOpen } = renderDetail(make());
    const link = screen.getByRole("link", { name: /open/i });
    expect(link).toHaveAttribute("href", "/acme/docs/doc_1");
    fireEvent.click(link);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("shows a safe unavailable state (no Open link) when the target is gone", () => {
    renderDetail(make({ href: null }));
    expect(screen.queryByRole("link", { name: /open/i })).toBeNull();
    expect(screen.getByText(/no longer available/i)).toBeInTheDocument();
  });

  it("the toolbar toggle reflects read state and fires onToggleRead", () => {
    const { onToggleRead } = renderDetail(make({ read: false }));
    const btn = screen.getByRole("button", { name: /mark as read/i });
    fireEvent.click(btn);
    expect(onToggleRead).toHaveBeenCalledTimes(1);
  });

  it("offers a back control on mobile when onBack is provided", () => {
    const onBack = vi.fn();
    renderDetail(make(), { onBack });
    fireEvent.click(screen.getByRole("button", { name: /back to inbox/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
