import { describe, expect, it } from "vitest";

import { virtualWindow } from "./virtual-window";

const ROW = 44;
const HEADER = 56;

const win = (over: Partial<Parameters<typeof virtualWindow>[0]> = {}) =>
  virtualWindow({
    total: 1000,
    scrollTop: 0,
    viewportHeight: 800,
    rowHeight: ROW,
    headerHeight: HEADER,
    ...over,
  });

describe("virtualWindow", () => {
  it("renders a bounded slice of a 1000-row backlog", () => {
    // The ticket's bar: 1000+ items must not mean 1000 rendered rows.
    const w = win();
    expect(w.first).toBe(0);
    expect(w.last - w.first).toBeLessThan(40);
    expect(w.last).toBeLessThan(1000);
  });

  it("preserves total scroll height so the scrollbar doesn't lie", () => {
    for (const scrollTop of [0, 500, 5_000, 43_000]) {
      const w = win({ scrollTop });
      const rendered = (w.last - w.first) * ROW;
      expect(w.padTop + rendered + w.padBottom).toBe(1000 * ROW);
    }
  });

  it("clamps above the first row instead of going negative", () => {
    // scrollTop < headerHeight puts the offset below zero.
    expect(win({ scrollTop: 0 }).first).toBe(0);
    expect(win({ scrollTop: 10 }).first).toBe(0);
    expect(win({ scrollTop: HEADER }).first).toBe(0);
    expect(win({ scrollTop: 0 }).padTop).toBe(0);
  });

  it("advances the window as it scrolls", () => {
    const top = win({ scrollTop: 0 });
    const mid = win({ scrollTop: 10_000 });
    expect(mid.first).toBeGreaterThan(top.first);
    // ~(10000-56)/44 = 226, less 6 overscan.
    expect(mid.first).toBe(Math.floor((10_000 - HEADER) / ROW) - 6);
    expect(mid.padTop).toBe(mid.first * ROW);
  });

  it("stops at the end of the list", () => {
    const w = win({ scrollTop: 1000 * ROW });
    expect(w.last).toBe(1000);
    expect(w.padBottom).toBe(0);
    expect(w.first).toBeLessThan(1000);
  });

  it("keeps overscan rows either side so a fast scroll shows no gap", () => {
    const w = win({ scrollTop: 10_000, viewportHeight: 440 }); // 10 rows visible
    expect(w.last - w.first).toBe(10 + 6 * 2);
  });

  it("handles an empty list", () => {
    expect(win({ total: 0 })).toEqual({ first: 0, last: 0, padTop: 0, padBottom: 0 });
  });

  it("renders at least one row before the viewport has been measured", () => {
    // First paint: ResizeObserver hasn't reported a height yet.
    const w = win({ viewportHeight: 0 });
    expect(w.last).toBeGreaterThan(w.first);
  });

  it("renders every row when the list is shorter than the viewport", () => {
    const w = win({ total: 5 });
    expect(w.first).toBe(0);
    expect(w.last).toBe(5);
    expect(w.padTop).toBe(0);
    expect(w.padBottom).toBe(0);
  });
});
