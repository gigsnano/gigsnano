// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { IMeetingActionItem, IProjectMember } from "@/types";

import { ActionItemCard } from "./action-item-card";

const { update, approve, dismiss } = vi.hoisted(() => ({
  update: vi.fn(),
  approve: vi.fn(),
  dismiss: vi.fn(),
}));

vi.mock("@/hooks/meetings/use-meetings", () => ({
  useUpdateActionItem: () => ({ mutate: update, isPending: false, isError: false }),
  useApproveActionItem: () => ({ mutate: approve, isPending: false, isError: false }),
  useDismissActionItem: () => ({ mutate: dismiss, isPending: false, isError: false }),
}));

const item: IMeetingActionItem = {
  id: "mai_1",
  meeting_id: "mtg_1",
  status: "pending",
  type: "bug",
  title: "Fix payment timeout for some cards",
  description: "The payment timeout is still failing for some cards.",
  quote: "The payment timeout is still failing for some cards. I'll fix that bug by Friday.",
  speaker_name: "Alan",
  assignee_id: null,
  target_date: null,
  created_story_id: null,
  position: 0,
};

const members: IProjectMember[] = [];

const renderCard = () =>
  render(
    <ActionItemCard
      workspaceSlug="acme"
      projectId="prj_1"
      meetingId="mtg_1"
      item={item}
      members={members}
    />,
  );

beforeEach(() => {
  update.mockReset();
  approve.mockReset();
  dismiss.mockReset();
});

afterEach(cleanup);

/**
 * Regression for the review finding: Escape reverted the draft and then
 * blurred, but onBlur read the DOM's stale (pre-revert) value and PATCHed the
 * discarded text. `skipNextTitleCommit` (a ref, set right before the
 * synchronous `blur()`) must make Escape a true no-op mutation-wise.
 */
describe("ActionItemCard title editing", () => {
  it("Escape reverts the input to the server value and fires no update", () => {
    renderCard();
    const input = screen.getByLabelText(`Title for "${item.title}"`) as HTMLInputElement;
    input.focus();
    fireEvent.change(input, { target: { value: "Something else entirely" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(input.value).toBe(item.title);
    expect(update).not.toHaveBeenCalled();
  });

  it("Enter commits the edited title", () => {
    renderCard();
    const input = screen.getByLabelText(`Title for "${item.title}"`) as HTMLInputElement;
    input.focus();
    fireEvent.change(input, { target: { value: "Fix payment timeout everywhere" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(update).toHaveBeenCalledWith({
      id: item.id,
      payload: { title: "Fix payment timeout everywhere" },
    });
  });

  it("blurring without Enter or Escape still commits", () => {
    renderCard();
    const input = screen.getByLabelText(`Title for "${item.title}"`) as HTMLInputElement;
    input.focus();
    fireEvent.change(input, { target: { value: "Renamed via blur" } });
    fireEvent.blur(input);

    expect(update).toHaveBeenCalledWith({
      id: item.id,
      payload: { title: "Renamed via blur" },
    });
  });

  it("a second, ordinary blur after an Escape still commits (the skip only consumes once)", () => {
    renderCard();
    const input = screen.getByLabelText(`Title for "${item.title}"`) as HTMLInputElement;
    input.focus();
    fireEvent.change(input, { target: { value: "discarded" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(update).not.toHaveBeenCalled();

    input.focus();
    fireEvent.change(input, { target: { value: "kept this time" } });
    fireEvent.blur(input);

    expect(update).toHaveBeenCalledWith({
      id: item.id,
      payload: { title: "kept this time" },
    });
  });
});
