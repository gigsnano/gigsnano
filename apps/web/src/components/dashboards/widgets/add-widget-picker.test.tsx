// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EDashboardWidgetType } from "@/types";

import { AddWidgetPicker } from "./add-widget-picker";

const onAdd = vi.fn();

const renderPicker = (added: EDashboardWidgetType[] = []) =>
  render(<AddWidgetPicker disabled={false} addedTypes={added} onAdd={onAdd} />);

const openPicker = () => fireEvent.click(screen.getByRole("button", { name: "Add widget" }));

beforeEach(() => {
  onAdd.mockReset();
  // Radix popover positioning needs these; jsdom ships neither.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.hasPointerCapture ??= () => false;
});

afterEach(cleanup);

describe("AddWidgetPicker", () => {
  it("groups the catalogue into categories", () => {
    renderPicker();
    openPicker();

    expect(screen.getByRole("region", { name: "Work items" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Delivery & sprints" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Personal" })).toBeInTheDocument();
  });

  it("searches by name, description and category", () => {
    renderPicker();
    openPicker();
    const search = screen.getByLabelText("Search widgets");

    fireEvent.change(search, { target: { value: "velocity" } });
    expect(screen.getByText("Sprint velocity")).toBeInTheDocument();
    expect(screen.queryByText("Activity feed")).toBeNull();

    // Description-only match: "Recent events across the workspace".
    fireEvent.change(search, { target: { value: "recent events" } });
    expect(screen.getByText("Activity feed")).toBeInTheDocument();

    // Category-only match: nothing in "Personal" contains the word.
    fireEvent.change(search, { target: { value: "personal" } });
    expect(screen.getByText("Assigned to me")).toBeInTheDocument();
    expect(screen.getByText("Watched work items")).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "zzz" } });
    expect(screen.getByText(/No widgets match/)).toBeInTheDocument();
  });

  it("marks widgets already on the board as Added but still allows adding", () => {
    renderPicker([EDashboardWidgetType.Kpi]);
    openPicker();

    expect(screen.getByText("Added")).toBeInTheDocument();
    fireEvent.click(screen.getByText("KPI tile"));
    expect(onAdd).toHaveBeenCalledWith(EDashboardWidgetType.Kpi);
  });

  it("moves focus through rows with the arrow keys", () => {
    renderPicker();
    openPicker();

    const search = screen.getByLabelText("Search widgets");
    fireEvent.keyDown(search, { key: "ArrowDown" });
    const rows = document.querySelectorAll("[data-widget-row]");
    expect(document.activeElement).toBe(rows[0]);

    fireEvent.keyDown(rows[0], { key: "ArrowDown" });
    expect(document.activeElement).toBe(rows[1]);

    fireEvent.keyDown(rows[1], { key: "End" });
    expect(document.activeElement).toBe(rows[rows.length - 1]);

    fireEvent.keyDown(rows[rows.length - 1], { key: "Home" });
    expect(document.activeElement).toBe(rows[0]);
  });
});
