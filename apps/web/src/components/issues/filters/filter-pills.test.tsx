// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { EStoryPriority, EStoryStatus } from "@/types";
import {
  EMPTY_ISSUE_FILTERS,
  useIssuesViewStore,
} from "@/store/ui/issues-view.store";

import { FilterPills } from "./filter-pills";

afterEach(() => {
  cleanup();
  useIssuesViewStore.setState({ filters: EMPTY_ISSUE_FILTERS, gigsqlQuery: "" });
});

describe("FilterPills", () => {
  it("renders N pills for active filters and clears a facet on remove", () => {
    useIssuesViewStore.setState({
      filters: {
        ...EMPTY_ISSUE_FILTERS,
        status: [EStoryStatus.Todo],
        priority: [EStoryPriority.High],
      },
      gigsqlQuery: "status = todo AND priority = high",
    });

    render(<FilterPills />);

    expect(screen.getAllByRole("button")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Remove Status filter" }));

    const { filters } = useIssuesViewStore.getState();
    expect(filters.status).toEqual([]);
    expect(filters.priority).toEqual([EStoryPriority.High]);
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("shows one GigsQL pill for complex queries and clears all on remove", () => {
    const query = "assignee = me OR assignee is null";
    useIssuesViewStore.setState({
      filters: EMPTY_ISSUE_FILTERS,
      gigsqlQuery: query,
    });

    render(<FilterPills />);

    expect(screen.getAllByRole("button")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: `Remove ${query} filter` }));

    const state = useIssuesViewStore.getState();
    expect(state.filters).toEqual(EMPTY_ISSUE_FILTERS);
    expect(state.gigsqlQuery).toBe("");
  });
});
