// @vitest-environment jsdom
// src/components/editor/rich-editor.value-sync.test.tsx
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { RichEditor } from "./rich-editor";

beforeAll(() => {
  document.elementFromPoint = vi.fn(() => null);
  // jsdom has no layout engine and implements none of Range's CSSOM-view methods.
  // After a paste, ProseMirror scrolls the selection into view through them and
  // would throw asynchronously, outside any assertion. Zero-size rects are fine:
  // nothing here asserts on geometry.
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () =>
    ({ top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0, x: 0, y: 0 }) as DOMRect;
});

function getProseMirror(container: HTMLElement): HTMLElement {
  const el = container.querySelector(".ProseMirror");
  if (!el) throw new Error("ProseMirror content div not found");
  return el as HTMLElement;
}

describe("RichEditor external value sync", () => {
  /**
   * Consumers hold live edits in refs and pass `value` only as a *seed* (page
   * detail, work-item description). Re-seeding on blur therefore throws the
   * user's edits away — which is what made bubble-menu formatting "revert": the
   * button takes DOM focus, the editor blurs, and the document snaps back.
   */
  it("keeps edits when the editor blurs while `value` still holds the seed", async () => {
    const onChange = vi.fn();
    const { container } = render(
      <RichEditor value="<p>Seed</p>" onChange={onChange} variant="full" />,
    );
    await waitFor(() => getProseMirror(container));

    await userEvent.click(getProseMirror(container));
    await userEvent.paste("edited");
    // Guard the reproduction itself: the edit has to have reached the document,
    // or the blur assertion below would pass for the wrong reason.
    await waitFor(() => expect(getProseMirror(container).textContent).toContain("edited"));

    fireEvent.blur(getProseMirror(container));

    expect(getProseMirror(container).textContent).toContain("edited");
  });

  it("still adopts a genuinely new `value` from the consumer", async () => {
    const { container, rerender } = render(
      <RichEditor value="<p>First</p>" onChange={vi.fn()} variant="full" />,
    );
    await waitFor(() => expect(getProseMirror(container).textContent).toContain("First"));

    rerender(<RichEditor value="<p>Second</p>" onChange={vi.fn()} variant="full" />);

    await waitFor(() => expect(getProseMirror(container).textContent).toContain("Second"));
  });
});
