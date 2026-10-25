// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SourceModeToggle } from "./source-mode-toggle";

describe("SourceModeToggle", () => {
  it("labels the current mode and fires onToggle", async () => {
    const onToggle = vi.fn();
    render(<SourceModeToggle mode="visual" onToggle={onToggle} />);
    const btn = screen.getByRole("button", { name: /edit as markdown/i });
    expect(btn).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(btn);
    expect(onToggle).toHaveBeenCalledOnce();
  });
});
