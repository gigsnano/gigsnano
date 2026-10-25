// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useStickToBottom } from "./use-stick-to-bottom";

function setScrollMetrics(
  el: HTMLElement,
  { scrollHeight, scrollTop, clientHeight }: { scrollHeight: number; scrollTop: number; clientHeight: number },
) {
  Object.defineProperty(el, "scrollHeight", { configurable: true, value: scrollHeight });
  Object.defineProperty(el, "scrollTop", { configurable: true, value: scrollTop });
  Object.defineProperty(el, "clientHeight", { configurable: true, value: clientHeight });
}

/** Stands in for MeetingTranscript: the scroll region only mounts once
 * `mounted` flips true, mirroring a skeleton/empty state being replaced by
 * the real transcript after data arrives. */
function TranscriptStub({ mounted, dep }: { mounted: boolean; dep: unknown }) {
  const { ref, atBottom, scrollToBottom } = useStickToBottom<HTMLDivElement>(dep);
  return (
    <div>
      <span data-testid="at-bottom">{String(atBottom)}</span>
      <button type="button" onClick={scrollToBottom}>
        jump
      </button>
      {mounted ? (
        <div ref={ref} data-testid="scroller">
          content
        </div>
      ) : (
        <div data-testid="skeleton">loading…</div>
      )}
    </div>
  );
}

beforeEach(() => {
  // jsdom implements neither of these — stub them so scrollToEnd() doesn't throw.
  Element.prototype.scrollTo = vi.fn();
  window.matchMedia = vi.fn().mockReturnValue({ matches: false });
});

afterEach(cleanup);

describe("useStickToBottom", () => {
  it("attaches the scroll listener once the element mounts after the first render (e.g. behind a skeleton)", () => {
    const { rerender } = render(<TranscriptStub mounted={false} dep={0} />);
    expect(screen.queryByTestId("scroller")).toBeNull();

    rerender(<TranscriptStub mounted dep={1} />);
    const scroller = screen.getByTestId("scroller");
    setScrollMetrics(scroller, { scrollHeight: 1000, scrollTop: 400, clientHeight: 200 }); // 400 > threshold

    act(() => {
      fireEvent.scroll(scroller);
    });

    expect(screen.getByTestId("at-bottom")).toHaveTextContent("false");
  });

  it("scrolling up sets atBottom to false", () => {
    render(<TranscriptStub mounted dep={0} />);
    const scroller = screen.getByTestId("scroller");

    setScrollMetrics(scroller, { scrollHeight: 1000, scrollTop: 900, clientHeight: 100 }); // 0 — at bottom
    act(() => fireEvent.scroll(scroller));
    expect(screen.getByTestId("at-bottom")).toHaveTextContent("true");

    setScrollMetrics(scroller, { scrollHeight: 1000, scrollTop: 200, clientHeight: 100 }); // 700 — scrolled up
    act(() => fireEvent.scroll(scroller));
    expect(screen.getByTestId("at-bottom")).toHaveTextContent("false");
  });

  it("returning within the threshold sets atBottom back to true", () => {
    render(<TranscriptStub mounted dep={0} />);
    const scroller = screen.getByTestId("scroller");

    setScrollMetrics(scroller, { scrollHeight: 1000, scrollTop: 200, clientHeight: 100 }); // 700 — away
    act(() => fireEvent.scroll(scroller));
    expect(screen.getByTestId("at-bottom")).toHaveTextContent("false");

    setScrollMetrics(scroller, { scrollHeight: 1000, scrollTop: 880, clientHeight: 100 }); // 20 — within threshold
    act(() => fireEvent.scroll(scroller));
    expect(screen.getByTestId("at-bottom")).toHaveTextContent("true");
  });
});
