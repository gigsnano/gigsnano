// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { contentService } from "@/services/content.service";

import { decideExit, useSourceMode } from "./use-source-mode";

vi.mock("@/services/content.service", () => ({
  contentService: {
    toMarkdown: vi.fn(),
    fromMarkdown: vi.fn(),
  },
}));

const mockToMarkdown = vi.mocked(contentService.toMarkdown);
const mockFromMarkdown = vi.mocked(contentService.fromMarkdown);

describe("decideExit", () => {
  const cached = { json: { type: "doc", n: 1 }, markdown: "MD" };

  it("restores cached json verbatim when the buffer is unchanged", () => {
    const d = decideExit({ cached, buffer: "MD" });
    expect(d).toEqual({ kind: "restore", json: cached.json });
  });

  it("requests a parse when the buffer was edited", () => {
    const d = decideExit({ cached, buffer: "MD edited" });
    expect(d).toEqual({ kind: "parse", markdown: "MD edited" });
  });
});

describe("useSourceMode", () => {
  const originalJson = { type: "doc", n: 1 };

  beforeEach(() => {
    mockToMarkdown.mockReset();
    mockFromMarkdown.mockReset();
  });

  function setup() {
    const getJson = vi.fn(() => originalJson);
    const setJson = vi.fn();
    const { result } = renderHook(() => useSourceMode({ getJson, setJson }));
    return { result, getJson, setJson };
  }

  it("enter() switches to source mode and seeds buffer/lossy from the service, caching the original json", async () => {
    mockToMarkdown.mockResolvedValue({ markdown: "# md", lossy: ["mermaid"] });
    const { result, setJson } = setup();

    act(() => {
      result.current.enter();
    });
    await waitFor(() => expect(result.current.mode).toBe("source"));

    expect(result.current.buffer).toBe("# md");
    expect(result.current.lossy).toEqual(["mermaid"]);
    expect(result.current.busy).toBe(false);

    // re-reading confirms the cache was seeded: an immediate unedited exit restores it
    await act(async () => {
      await result.current.exit();
    });
    expect(result.current.mode).toBe("visual");
    expect(setJson).toHaveBeenCalledWith(originalJson);
  });

  it("exit() with an unchanged buffer restores the original json losslessly, without calling fromMarkdown", async () => {
    mockToMarkdown.mockResolvedValue({ markdown: "# md", lossy: [] });
    const { result, setJson } = setup();

    act(() => {
      result.current.enter();
    });
    await waitFor(() => expect(result.current.mode).toBe("source"));

    await act(async () => {
      await result.current.exit();
    });

    expect(setJson).toHaveBeenCalledWith(originalJson);
    expect(result.current.mode).toBe("visual");
    expect(mockFromMarkdown).not.toHaveBeenCalled();
  });

  it("exit() with an edited buffer that fails to parse stays in source mode and never touches the canonical json", async () => {
    mockToMarkdown.mockResolvedValue({ markdown: "# md", lossy: [] });
    mockFromMarkdown.mockResolvedValue({ json: null, errors: [{ message: "bad" }] });
    const { result, setJson } = setup();

    act(() => {
      result.current.enter();
    });
    await waitFor(() => expect(result.current.mode).toBe("source"));

    act(() => {
      result.current.setBuffer("edited");
    });

    let resolved: boolean | undefined;
    await act(async () => {
      resolved = await result.current.exit();
    });

    expect(resolved).toBe(false);
    expect(result.current.mode).toBe("source");
    expect(setJson).not.toHaveBeenCalled();
    expect(result.current.errors).toEqual([{ message: "bad" }]);
  });

  it("exit() with an edited buffer that fails to reach the network stays in source mode, never touches the canonical json, and surfaces an error", async () => {
    mockToMarkdown.mockResolvedValue({ markdown: "# md", lossy: [] });
    mockFromMarkdown.mockRejectedValue(new Error("net"));
    const { result, setJson } = setup();

    act(() => {
      result.current.enter();
    });
    await waitFor(() => expect(result.current.mode).toBe("source"));

    act(() => {
      result.current.setBuffer("edited");
    });

    let resolved: boolean | undefined;
    await act(async () => {
      resolved = await result.current.exit();
    });

    expect(resolved).toBe(false);
    expect(result.current.mode).toBe("source");
    expect(setJson).not.toHaveBeenCalled();
    expect(result.current.errors).toEqual([{ message: "Could not parse Markdown" }]);
    expect(result.current.busy).toBe(false);
  });

  it("exit() with an edited buffer that parses cleanly switches to visual with the parsed json", async () => {
    mockToMarkdown.mockResolvedValue({ markdown: "# md", lossy: [] });
    const parsedJson = { type: "doc", edited: true };
    mockFromMarkdown.mockResolvedValue({ json: parsedJson, errors: [] });
    const { result, setJson } = setup();

    act(() => {
      result.current.enter();
    });
    await waitFor(() => expect(result.current.mode).toBe("source"));

    act(() => {
      result.current.setBuffer("edited");
    });

    let resolved: boolean | undefined;
    await act(async () => {
      resolved = await result.current.exit();
    });

    expect(resolved).toBe(true);
    expect(result.current.mode).toBe("visual");
    expect(setJson).toHaveBeenCalledWith(parsedJson);
  });
});
