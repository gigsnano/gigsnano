// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ColumnFilterControl } from "./column-filter-control";

afterEach(() => cleanup());

describe("ColumnFilterControl", () => {
  it("opens the popover and calls onChange when a multi option is selected", () => {
    const onChange = vi.fn();
    render(
      <ColumnFilterControl
        field={{ key: "status", label: "Status", kind: "multi" }}
        value={[]}
        options={[
          { value: "todo", label: "Todo" },
          { value: "done", label: "Done" },
        ]}
        activeCount={0}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Filter by Status" }));
    fireEvent.click(screen.getByRole("button", { name: "Todo" }));

    expect(onChange).toHaveBeenCalledWith(["todo"]);
  });

  it("shows a badge when activeCount is greater than zero", () => {
    render(
      <ColumnFilterControl
        field={{ key: "status", label: "Status", kind: "multi" }}
        value={["todo"]}
        options={[{ value: "todo", label: "Todo" }]}
        activeCount={2}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("2")).toBeInTheDocument();
  });
});
