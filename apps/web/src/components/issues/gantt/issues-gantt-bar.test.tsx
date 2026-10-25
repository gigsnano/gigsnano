// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { IStory } from "@/types";
import { EStoryStatus } from "@/types";
import { IssuesGanttBar } from "./issues-gantt-bar";

// The mock MUST call a hook. Real next/navigation useRouter calls useContext, so
// the pre-early-return render is never hook-empty. A hookless mock makes render 1
// call zero hooks, which leaves fiber.memoizedState null — React then picks the
// MOUNT dispatcher on render 2 and the hook-order bug silently cannot fire,
// making these tests vacuous.
vi.mock("next/navigation", () => ({
  useRouter: () => {
    const push = useRef(vi.fn()).current;
    return { push };
  },
}));

const story = (dates: Partial<IStory>): IStory =>
  ({
    id: "s1",
    title: "Bar",
    status: EStoryStatus.Todo,
    start_date: null,
    target_date: null,
    ...dates,
  }) as IStory;

const renderBar = (s: IStory) =>
  render(
    <IssuesGanttBar
      story={s}
      chartStart={new Date("2026-01-01T00:00:00Z")}
      dayWidth={20}
      onCommitDates={vi.fn()}
    />,
  );

afterEach(cleanup);

describe("IssuesGanttBar", () => {
  it("renders nothing when the story has no dates", () => {
    const { container } = renderBar(story({}));
    expect(container).toBeEmptyDOMElement();
  });

  // The regression this guards: the drag hook (useRef + 3x useState) used to sit
  // AFTER `if (!position) return null`. A mounted dateless bar rendered 1 hook;
  // gaining dates rendered 5, so React threw "Rendered more hooks than during the
  // previous render". Keep the early return in a hookless wrapper.
  it("survives a dateless bar gaining dates while mounted", () => {
    const { rerender } = renderBar(story({}));

    expect(() =>
      rerender(
        <IssuesGanttBar
          story={story({ start_date: "2026-01-05", target_date: "2026-01-09" })}
          chartStart={new Date("2026-01-01T00:00:00Z")}
          dayWidth={20}
          onCommitDates={vi.fn()}
        />,
      ),
    ).not.toThrow();

    expect(screen.getByText("Bar")).toBeInTheDocument();
  });

  it("survives losing dates while mounted", () => {
    const { rerender, container } = renderBar(
      story({ start_date: "2026-01-05", target_date: "2026-01-09" }),
    );

    expect(() =>
      rerender(
        <IssuesGanttBar
          story={story({})}
          chartStart={new Date("2026-01-01T00:00:00Z")}
          dayWidth={20}
          onCommitDates={vi.fn()}
        />,
      ),
    ).not.toThrow();

    expect(container).toBeEmptyDOMElement();
  });
});
