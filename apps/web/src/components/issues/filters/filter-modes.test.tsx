// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EStoryPriority, EStoryStatus } from "@/types";

import { AdvancedFilterBuilder } from "./advanced-filter-builder";
import { GigsqlEditor } from "./gigsql-editor";
import { filtersToRows, gigsqlToRows, rowsToGigsql } from "@/lib/views/gigsql-codec";

afterEach(() => cleanup());

describe("visual row codec", () => {
  it("maps status and priority rows to canonical GigsQL", () => {
    const query = rowsToGigsql([
      { id: "1", field: "status", operator: "in", value: "todo, in_progress" },
      { id: "2", field: "priority", operator: "=", value: "high" },
    ]);
    expect(query).toBe("status in (todo, in_progress) AND priority = high");
  });

  it("round-trips text edits into visual rows", () => {
    const text = "status = done AND title ~ auth";
    const rows = gigsqlToRows(text);
    expect(rows).toEqual([
      { id: "1", field: "status", operator: "=", value: "done" },
      { id: "2", field: "title", operator: "~", value: "auth" },
    ]);
    expect(rowsToGigsql(rows!)).toBe(text);
  });

  it("returns null rows for OR expressions", () => {
    expect(gigsqlToRows("assignee = me OR assignee is null")).toBeNull();
  });
});

describe("AdvancedFilterBuilder", () => {
  it("emits GigsQL when status and priority values are chosen", () => {
    const onChange = vi.fn();
    render(<AdvancedFilterBuilder query="" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Add condition" }));
    fireEvent.change(screen.getByLabelText("Filter field"), {
      target: { value: "status" },
    });
    fireEvent.change(screen.getByLabelText("Filter operator"), {
      target: { value: "in" },
    });
    fireEvent.change(screen.getByLabelText("Filter value"), {
      target: { value: `${EStoryStatus.Todo}, ${EStoryStatus.InProgress}` },
    });

    fireEvent.click(screen.getByRole("button", { name: "Add condition" }));

    const fieldSelects = screen.getAllByLabelText("Filter field");
    fireEvent.change(fieldSelects[1], { target: { value: "priority" } });
    const valueSelects = screen.getAllByLabelText("Filter value");
    fireEvent.change(valueSelects[1], { target: { value: EStoryPriority.High } });

    expect(onChange).toHaveBeenLastCalledWith(
      "status in (todo, in_progress) AND priority = high",
    );
  });

  it("shows read-only state for OR queries", () => {
    render(
      <AdvancedFilterBuilder
        query="assignee = me OR assignee is null"
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/visual builder cannot edit/i)).toBeInTheDocument();
  });
});

describe("GigsqlEditor", () => {
  it("shows a parse error for invalid text", () => {
    render(<GigsqlEditor value="status:bad-value" onChange={vi.fn()} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("accepts valid canonical syntax without error", () => {
    render(
      <GigsqlEditor
        value="status in (todo, in_progress) AND priority = high"
        onChange={vi.fn()}
      />,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("filtersToRows sync", () => {
  it("derives rows from structured filters for visual mode", () => {
    const rows = filtersToRows({
      status: [EStoryStatus.Todo],
      priority: [EStoryPriority.High],
      assignee: [],
      label: [],
      type: [],
      cycle: [],
      module: [],
      custom: {},
      title: "",
      dueFrom: null,
      dueTo: null,
      createdFrom: null,
      createdTo: null,
    });
    expect(rowsToGigsql(rows)).toBe("status = todo AND priority = high");
  });
});
