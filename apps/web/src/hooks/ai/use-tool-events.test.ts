// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TOOL_STALLED_SUMMARY, useToolEvents } from "./use-tool-events";

const data = (part: Record<string, unknown>) => ({ type: "data-tool-event", data: part });

describe("useToolEvents.settle (GIN-478)", () => {
  it("ends a tool left running when the turn produced no result", () => {
    const { result } = renderHook(() => useToolEvents());

    act(() => {
      result.current.onData(data({ type: "tool_call", tool_use_id: "t1", name: "create_work_item" }));
    });
    expect(result.current.events[0]!.status).toBe("running");

    act(() => result.current.settle());
    expect(result.current.events[0]).toMatchObject({
      status: "error",
      summary: TOOL_STALLED_SUMMARY,
    });
  });

  it("ends a tool stuck mid-resume (approved, then the stream died)", () => {
    const { result } = renderHook(() => useToolEvents());

    act(() => {
      result.current.onData(data({ type: "tool_call", tool_use_id: "t1", name: "create_work_item" }));
      result.current.onData(data({ type: "tool_confirmation", tool_use_id: "t1", name: "create_work_item" }));
    });
    act(() => result.current.setStatus("t1", "resuming"));

    act(() => result.current.settle());
    expect(result.current.events[0]!.status).toBe("error");
  });

  it("leaves a confirmation alone — it waits on the user, not the stream", () => {
    const { result } = renderHook(() => useToolEvents());

    act(() => {
      result.current.onData(data({ type: "tool_call", tool_use_id: "t1", name: "create_work_item" }));
      result.current.onData(data({ type: "tool_confirmation", tool_use_id: "t1", name: "create_work_item" }));
    });

    act(() => result.current.settle());
    expect(result.current.events[0]!.status).toBe("confirming");
  });

  it("keeps a finished tool's result and its deep link", () => {
    const { result } = renderHook(() => useToolEvents());

    act(() => {
      result.current.onData(data({ type: "tool_call", tool_use_id: "t1", name: "create_work_item" }));
      result.current.onData(
        data({
          type: "tool_result",
          tool_use_id: "t1",
          summary: "Created GIN-42",
          is_error: false,
          link: "/acme/projects/p1/issues/s1",
        }),
      );
    });

    act(() => result.current.settle());
    expect(result.current.events[0]).toMatchObject({
      status: "done",
      summary: "Created GIN-42",
      link: "/acme/projects/p1/issues/s1",
    });
  });
});
