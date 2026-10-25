// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EDeleteCascade, type IStory } from "@/types";
import { useDeleteWorkItemStore } from "@/store/ui/delete-work-item.store";

// Capture what the delete mutation is called with; invoke onSuccess so the
// dialog closes and onDeleted fires.
const mutate = vi.fn((_vars: unknown, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.());
vi.mock("@/hooks/story/use-stories", () => ({
  useDeleteStory: () => ({ mutate, isPending: false }),
}));

import { DeleteWorkItemDialogHost } from "./delete-work-item-dialog";

function makeStory(overrides: Partial<IStory>): IStory {
  return { id: "s1", title: "My item", sub_issue_count: 0, ...overrides } as IStory;
}

const openWith = (story: IStory, onDeleted?: () => void) =>
  act(() =>
    useDeleteWorkItemStore
      .getState()
      .open({ story, workspaceSlug: "acme", projectId: "p1", onDeleted }),
  );

afterEach(() => {
  cleanup();
  mutate.mockClear();
  act(() => useDeleteWorkItemStore.getState().close());
});

describe("DeleteWorkItemDialogHost", () => {
  it("a leaf item confirms with no cascade choice and no cascade param", () => {
    render(<DeleteWorkItemDialogHost />);
    openWith(makeStory({ sub_issue_count: 0 }));

    expect(screen.queryByRole("radiogroup")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Move to Trash" }));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0]).toEqual({ storyId: "s1", cascade: undefined });
  });

  it("an item with children offers the choice and passes the chosen cascade", () => {
    const onDeleted = vi.fn();
    render(<DeleteWorkItemDialogHost />);
    openWith(makeStory({ sub_issue_count: 3 }), onDeleted);

    // Choice is shown; default keeps sub-items (detach).
    expect(screen.getByRole("radiogroup")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /Move sub-items too/ }));
    fireEvent.click(screen.getByRole("button", { name: "Move to Trash" }));

    expect(mutate.mock.calls[0][0]).toEqual({
      storyId: "s1",
      cascade: EDeleteCascade.Children,
    });
    expect(onDeleted).toHaveBeenCalledTimes(1);
  });

  it("defaults to detach when the choice is left untouched", () => {
    render(<DeleteWorkItemDialogHost />);
    openWith(makeStory({ sub_issue_count: 2 }));

    fireEvent.click(screen.getByRole("button", { name: "Move to Trash" }));
    expect(mutate.mock.calls[0][0]).toEqual({
      storyId: "s1",
      cascade: EDeleteCascade.Detach,
    });
  });
});
