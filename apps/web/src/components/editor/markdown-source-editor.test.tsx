// @vitest-environment jsdom
// src/components/editor/markdown-source-editor.test.tsx
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MarkdownSourceEditor } from "./markdown-source-editor";

describe("MarkdownSourceEditor", () => {
  it("renders the markdown value in a labeled source region", () => {
    render(<MarkdownSourceEditor value="# Hello" onChange={vi.fn()} errors={[]} />);
    // CodeMirror renders the text into the DOM; the container is aria-labeled.
    expect(screen.getByRole("textbox", { name: /markdown source/i })).toBeInTheDocument();
    expect(screen.getByText(/Hello/)).toBeInTheDocument();
  });
});
