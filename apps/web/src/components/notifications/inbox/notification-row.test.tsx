// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { INotification } from "@/types";
import { ENotificationKind } from "@/types";

// jsdom lacks the pointer-capture / scroll APIs Radix menus call on open.
beforeAll(() => {
  const proto = window.HTMLElement.prototype;
  proto.hasPointerCapture = vi.fn();
  proto.setPointerCapture = vi.fn();
  proto.releasePointerCapture = vi.fn();
  proto.scrollIntoView = vi.fn();
});

import { NotificationRow } from "./notification-row";

function make(overrides: Partial<INotification> = {}): INotification {
  return {
    id: "n1",
    workspace_slug: "acme",
    kind: ENotificationKind.Mention,
    title: "Grace mentioned you",
    body: "Can you review the PRD?",
    href: "/acme/docs/doc_1",
    read: false,
    created_at: "2026-07-19T09:00:00Z",
    actor: { id: "u2", display_name: "Grace Hopper", avatar_url: null },
    project: { id: "p1", name: "Mobile Banking App" },
    ...overrides,
  };
}

function renderRow(item: INotification, opts: { selected?: boolean } = {}) {
  const onSelect = vi.fn();
  const onToggleRead = vi.fn();
  render(
    <ul>
      <NotificationRow
        item={item}
        selected={opts.selected ?? false}
        onSelect={onSelect}
        onToggleRead={onToggleRead}
      />
    </ul>,
  );
  return { onSelect, onToggleRead };
}

const rowButton = () => screen.getByRole("button", { name: /grace mentioned you/i });
const actionsButton = () => screen.getByRole("button", { name: /notification actions/i });

function openActionsMenu() {
  const trigger = actionsButton();
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
  fireEvent.pointerUp(trigger, { button: 0, pointerType: "mouse" });
  fireEvent.click(trigger);
}

afterEach(() => cleanup());

describe("NotificationRow", () => {
  it("is a keyboard-reachable button (Enter/Space activate natively)", () => {
    renderRow(make());
    expect(rowButton().tagName).toBe("BUTTON");
  });

  it("clicking the row selects it exactly once (opens detail + marks read)", () => {
    const { onSelect } = renderRow(make());
    fireEvent.click(rowButton());
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "n1" }));
  });

  it("marks the selected row with aria-current", () => {
    renderRow(make(), { selected: true });
    expect(rowButton()).toHaveAttribute("aria-current", "true");
  });

  it("the actions menu is NOT nested inside the row button (AC5)", () => {
    renderRow(make());
    expect(rowButton()).not.toContainElement(actionsButton());
  });

  it("renders actor, project, and the type label for a11y", () => {
    renderRow(make());
    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
    expect(screen.getByText("Mobile Banking App")).toBeInTheDocument();
    expect(screen.getByText("Mention:")).toBeInTheDocument();
  });

  it("mark read/unread via the overflow menu calls onToggleRead without selecting", () => {
    const { onSelect, onToggleRead } = renderRow(make({ read: false }));
    openActionsMenu();
    fireEvent.click(screen.getByText(/mark as read/i));
    expect(onToggleRead).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("offers 'Mark as unread' for an already-read row", () => {
    renderRow(make({ read: true }));
    openActionsMenu();
    expect(screen.getByText(/mark as unread/i)).toBeInTheDocument();
  });
});
