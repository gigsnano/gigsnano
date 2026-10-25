// @vitest-environment jsdom
// src/components/editor/rich-editor.source-mode.test.tsx
import "@testing-library/jest-dom/vitest";
import { render, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { RichEditor } from "./rich-editor";
import { contentService } from "@/services/content.service";

// jsdom has no layout engine, so it lacks `elementFromPoint`; ProseMirror's own
// mousedown handler calls it (via `posAtCoords`) on every real click into the
// editor. Stub it so `userEvent.click()` on the ProseMirror content div doesn't
// throw (harmless in jsdom — ProseMirror falls back gracefully when it's null).
beforeAll(() => {
  document.elementFromPoint = vi.fn(() => null);
});

// The ProseMirror content div carries no explicit or implicit ARIA "textbox"
// role (unlike CodeMirror's content div, which sets one itself), so it can't be
// located via `getByRole("textbox")` — that query happens to match a *different*
// editor's CodeMirror content if one is already mounted elsewhere in the DOM.
// Click into it via its `.ProseMirror` class instead. Every query below is
// scoped to the test's own render `container` via `within()` rather than the
// global `screen`, since this file doesn't call RTL's `cleanup()` between tests
// (unmounting the CodeMirror-backed source editor in jsdom wedges the shared
// timer queue and hangs later renders) — so several editors can be live in the
// DOM at once, and unscoped queries would be ambiguous or match the wrong one.
function getProseMirror(container: HTMLElement): HTMLElement {
  const el = container.querySelector(".ProseMirror");
  if (!el) throw new Error("ProseMirror content div not found");
  return el as HTMLElement;
}

describe("RichEditor source mode (full variant)", () => {
  it("toggles into source mode and shows the markdown from the backend", async () => {
    vi.spyOn(contentService, "toMarkdown").mockResolvedValue({ markdown: "# Hi", lossy: [] });
    const { container } = render(<RichEditor value="<h1>Hi</h1>" onChange={vi.fn()} variant="full" />);
    const scope = within(container);
    await userEvent.click(await scope.findByRole("button", { name: /edit as markdown/i }));
    await waitFor(() =>
      expect(scope.getByRole("group", { name: /markdown source editor/i })).toBeInTheDocument(),
    );
  });

  it("does not render the toggle for the comment variant", () => {
    const { container } = render(
      <RichEditor value="<p>x</p>" onChange={vi.fn()} variant="comment" mentionMembers={[]} />,
    );
    expect(within(container).queryByRole("button", { name: /edit as markdown/i })).toBeNull();
  });

  it("toggles source mode with Ctrl+Shift+M", async () => {
    vi.spyOn(contentService, "toMarkdown").mockResolvedValue({ markdown: "# Hi", lossy: [] });
    const { container } = render(<RichEditor value="<h1>Hi</h1>" onChange={vi.fn()} variant="full" />);
    const scope = within(container);
    await waitFor(() => getProseMirror(container));
    await userEvent.click(getProseMirror(container));
    await userEvent.keyboard("{Control>}{Shift>}m{/Shift}{/Control}");
    await waitFor(() =>
      expect(scope.getByRole("group", { name: /markdown source editor/i })).toBeInTheDocument(),
    );
  });

  it("toggles back out of source mode with Ctrl+Shift+M (two-way shortcut)", async () => {
    vi.spyOn(contentService, "toMarkdown").mockResolvedValue({ markdown: "# Hi", lossy: [] });
    const { container } = render(<RichEditor value="<h1>Hi</h1>" onChange={vi.fn()} variant="full" />);
    const scope = within(container);
    await waitFor(() => getProseMirror(container));
    await userEvent.click(getProseMirror(container));
    await userEvent.keyboard("{Control>}{Shift>}m{/Shift}{/Control}");
    const sourceGroup = await scope.findByRole("group", { name: /markdown source editor/i });
    await userEvent.keyboard("{Control>}{Shift>}m{/Shift}{/Control}");
    await waitFor(() =>
      expect(scope.queryByRole("group", { name: /markdown source editor/i })).toBeNull(),
    );
    expect(sourceGroup).not.toBeInTheDocument();
    await waitFor(() => expect(getProseMirror(container)).toBeInTheDocument());
  });
});
