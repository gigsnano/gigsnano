// @vitest-environment jsdom
/**
 * GIN-303 — the boundary around Mermaid rendering.
 *
 * These test *our* guarantees, not mermaid's own sanitizer:
 *
 *  - hostile or oversized source cannot take the tab down or reach the DOM sink;
 *  - a render never throws, so a bad diagram degrades to a readable error with
 *    the source intact rather than blanking the document;
 *  - `securityLevel: "strict"` is applied centrally, so no call site can forget it.
 *
 * Mermaid itself is mocked. Loading the real engine in jsdom is slow and its
 * layout depends on DOM measurement APIs jsdom doesn't implement — asserting on
 * upstream's sanitizer would be testing someone else's code through an
 * environment that can't run it faithfully.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const render = vi.fn();
const initialize = vi.fn();

vi.mock("mermaid", () => ({
  default: {
    initialize: (...args: unknown[]) => initialize(...args),
    render: (...args: unknown[]) => render(...args),
  },
}));

import { MERMAID_MAX_SOURCE, renderMermaid } from "./mermaid";

beforeEach(() => {
  render.mockReset();
  initialize.mockReset();
  render.mockResolvedValue({ svg: "<svg><g/></svg>" });
});

describe("source limits", () => {
  it("refuses source past the size limit instead of hanging the tab", async () => {
    // Mermaid parses and lays out synchronously on the main thread: a
    // pathological diagram doesn't fail, it freezes the page.
    const result = await renderMermaid("a".repeat(MERMAID_MAX_SOURCE + 1), {
      id: "x",
      dark: false,
    });
    expect(result.svg).toBeNull();
    expect(result.error).toMatch(/too large/i);
    expect(render).not.toHaveBeenCalled();
  });

  it("renders source at the limit", async () => {
    const result = await renderMermaid("a".repeat(MERMAID_MAX_SOURCE), { id: "x", dark: false });
    expect(result.error).toBeNull();
    expect(render).toHaveBeenCalled();
  });

  it("treats blank source as empty rather than an error", async () => {
    const result = await renderMermaid("   \n  ", { id: "x", dark: false });
    expect(result).toEqual({ svg: "", error: null });
    expect(render).not.toHaveBeenCalled();
  });
});

describe("failure handling", () => {
  it("never throws — an invalid diagram becomes a readable error", async () => {
    render.mockRejectedValue(new Error("Parse error on line 2"));
    const result = await renderMermaid("graph TD\n  ???", { id: "x", dark: false });
    expect(result.svg).toBeNull();
    expect(result.error).toBe("Parse error on line 2");
  });

  it("handles a non-Error rejection without leaking undefined into the UI", async () => {
    render.mockRejectedValue("boom");
    const result = await renderMermaid("graph TD", { id: "x", dark: false });
    expect(result.error).toBe("Invalid diagram");
  });

  it("returns no svg alongside an error, so a stale diagram can't linger", async () => {
    render.mockRejectedValue(new Error("nope"));
    const result = await renderMermaid("graph TD", { id: "x", dark: false });
    expect(result.svg).toBeNull();
  });
});

describe("security configuration", () => {
  it("always initializes with securityLevel strict", async () => {
    // Fresh module state: the theme is cached across calls, so a suite-level
    // import would skip initialize here and the assertion would pass vacuously.
    vi.resetModules();
    const { renderMermaid: fresh } = await import("./mermaid");
    await fresh("graph TD", { id: "x", dark: false });

    expect(initialize).toHaveBeenCalled();
    // Every configuration this module ever applies must carry strict — that is
    // what stops a future call site from rendering unsanitized SVG.
    for (const [config] of initialize.mock.calls) {
      expect(config).toMatchObject({ securityLevel: "strict", startOnLoad: false });
    }
  });

  it("does not re-initialize when the theme has not changed", async () => {
    // mermaid's config is process-global mutable state; re-applying it per
    // render is both wasted work and a chance for two diagrams to fight.
    await renderMermaid("graph TD", { id: "a", dark: false });
    const afterFirst = initialize.mock.calls.length;
    await renderMermaid("graph LR", { id: "b", dark: false });
    expect(initialize.mock.calls.length).toBe(afterFirst);
  });

  it("re-initializes when the theme flips", async () => {
    await renderMermaid("graph TD", { id: "a", dark: false });
    const afterLight = initialize.mock.calls.length;
    await renderMermaid("graph TD", { id: "a", dark: true });
    expect(initialize.mock.calls.length).toBeGreaterThan(afterLight);
    expect(initialize).toHaveBeenLastCalledWith(expect.objectContaining({ theme: "dark" }));
  });

  it("passes the caller's source through untouched, so the diagram is the user's", async () => {
    await renderMermaid("  graph TD\n  A-->B  ", { id: "x", dark: false });
    expect(render).toHaveBeenCalledWith("x", "graph TD\n  A-->B");
  });
});
