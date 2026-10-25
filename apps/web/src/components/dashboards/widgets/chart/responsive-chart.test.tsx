// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RESIZE_SETTLE_MS } from "./chart-layout";
import { ResponsiveChart } from "./responsive-chart";

/**
 * `sizeKey` is what remounts the chart so it re-measures (GIN-527 follow-up).
 * The chart library sizes itself once and keeps that width, so a widget that
 * changed size draws its series into the plot it first saw — bars laid out for
 * a narrower box stop short of the axis. What has to hold: the key follows the
 * box, but only once the box stops moving, or a drag replays the chart's enter
 * animation on every frame.
 */

let notify: ((entries: { contentRect: { width: number; height: number } }[]) => void) | null =
  null;

class FakeResizeObserver {
  constructor(cb: (entries: { contentRect: { width: number; height: number } }[]) => void) {
    notify = cb;
  }
  observe() {}
  disconnect() {}
}

/**
 * One resize, through the component's rAF coalescing and its settle timer.
 *
 * Two `act`s on purpose: the settle effect is only scheduled once React has
 * committed the new box, which happens as the first `act` exits. Advancing the
 * clock inside that same block would run before the timer it is meant to fire.
 */
function resizeTo(width: number, height: number, advanceMs = RESIZE_SETTLE_MS + 10) {
  act(() => {
    notify?.([{ contentRect: { width, height } }]);
    vi.advanceTimersByTime(16); // the coalescing frame
  });
  act(() => {
    vi.advanceTimersByTime(Math.max(advanceMs, 1));
  });
}

describe("ResponsiveChart sizeKey", () => {
  const keys: string[] = [];

  beforeEach(() => {
    keys.length = 0;
    notify = null;
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    // rAF faked too, so the observer's coalescing frame runs under our clock.
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
      setTimeout(() => cb(0), 16) as unknown as number,
    );
    vi.stubGlobal("cancelAnimationFrame", (id: number) =>
      clearTimeout(id as unknown as NodeJS.Timeout),
    );
    render(
      <ResponsiveChart>
        {(box) => {
          keys.push(box.sizeKey);
          return <div />;
        }}
      </ResponsiveChart>,
    );
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("holds the key through the first measurement", () => {
    const initial = keys.at(-1);
    resizeTo(800, 300, 0);
    // The chart measures itself when it mounts, so remounting here would replay
    // its entrance a tick after it began and fix nothing.
    expect(keys.at(-1)).toBe(initial);
  });

  it("changes the key after the box changes size and settles", () => {
    resizeTo(800, 300, 0);
    const beforeResize = keys.at(-1);
    resizeTo(1200, 300);
    expect(keys.at(-1)).not.toBe(beforeResize);
  });

  it("holds the key still while a drag is in flight", () => {
    resizeTo(800, 300, 0);
    const beforeDrag = keys.at(-1);
    // Mid-drag widths, none of them settled: remounting on these is the
    // per-frame animation replay this delay exists to prevent.
    resizeTo(900, 300, 20);
    resizeTo(1000, 300, 20);
    resizeTo(1100, 300, 20);
    expect(keys.at(-1)).toBe(beforeDrag);

    act(() => vi.advanceTimersByTime(RESIZE_SETTLE_MS + 10));
    expect(keys.at(-1)).not.toBe(beforeDrag);
  });

  it("remounts once for a whole drag, not once per frame", () => {
    resizeTo(800, 300, 0);
    resizeTo(900, 300, 20);
    resizeTo(1000, 300, 20);
    resizeTo(1100, 300, 20);
    act(() => vi.advanceTimersByTime(RESIZE_SETTLE_MS + 10));

    const distinct = keys.filter((k, i, a) => k !== a[i - 1]);
    expect(distinct).toHaveLength(2); // the mount, then one remount
  });

  it("stops rescheduling once the box and the key agree", () => {
    resizeTo(800, 300, 0);
    const settledAt = keys.length;
    // No further resize: an effect that kept re-scheduling itself would keep
    // re-rendering here forever.
    act(() => vi.advanceTimersByTime(RESIZE_SETTLE_MS * 5));
    expect(keys.length).toBe(settledAt);
  });
});
