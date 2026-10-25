// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ITrashedStory } from "@/types";
import { EStoryStatus, EStoryPriority } from "@/types";

const restoreMutate = vi.fn();
const purgeMutate = vi.fn((_v: unknown, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.());
let trashData: { items: ITrashedStory[]; total: number } = { items: [], total: 0 };

vi.mock("@/hooks/story/use-trash", () => ({
  useTrash: () => ({ data: trashData, isPending: false, isError: false, refetch: vi.fn() }),
  useRestoreStory: () => ({ mutate: restoreMutate, isPending: false, variables: undefined }),
  usePurgeStory: () => ({ mutate: purgeMutate, isPending: false }),
}));

import { TrashList } from "./trash-list";

function trashed(overrides: Partial<ITrashedStory>): ITrashedStory {
  return {
    id: "s1",
    title: "Deleted item",
    project_id: "p1",
    project_name: "Web App",
    project_identifier: "WEB",
    code: "WEB-1",
    status: EStoryStatus.Todo,
    priority: EStoryPriority.None,
    sub_issue_count: 0,
    deleted_at: new Date().toISOString(),
    deleted_by_id: "u1",
    ...overrides,
  } as ITrashedStory;
}

beforeEach(() => {
  trashData = { items: [], total: 0 };
  restoreMutate.mockClear();
  purgeMutate.mockClear();
});
afterEach(cleanup);

describe("TrashList", () => {
  it("shows the empty state when trash is empty", () => {
    render(<TrashList workspaceSlug="acme" />);
    expect(screen.getByText("Trash is empty")).toBeInTheDocument();
  });

  it("restores an item with its project + story id", () => {
    trashData = { items: [trashed({})], total: 1 };
    render(<TrashList workspaceSlug="acme" />);

    expect(screen.getByText("Deleted item")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    expect(restoreMutate).toHaveBeenCalledWith({ projectId: "p1", storyId: "s1" });
  });

  it("purges only after confirming in the dialog", () => {
    trashData = { items: [trashed({})], total: 1 };
    render(<TrashList workspaceSlug="acme" />);

    // Opening the row action shows a confirm; nothing purged yet.
    fireEvent.click(screen.getByRole("button", { name: /Delete Deleted item permanently/ }));
    expect(purgeMutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));
    expect(purgeMutate).toHaveBeenCalledWith(
      { projectId: "p1", storyId: "s1" },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });
});
