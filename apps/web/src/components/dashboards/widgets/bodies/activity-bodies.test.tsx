// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { IDashboardActivity, IDashboardMetrics, IPlannedWorkload } from "@/types";
import { EChartBucket, EWidgetDateRange } from "@/types";

let metrics: IDashboardMetrics;
let activity: IDashboardActivity;
let planned: IPlannedWorkload;
let metricsState = { isPending: false, isError: false };
/** Params the widget last asked its data hook for — the period/bucket contract. */
let lastActivityParams: Record<string, unknown> = {};
/** The workspace holiday calendar the chart excludes; set per test. */
let holidays = new Set<string>();

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

// Mocked like every other hook here rather than standing up a QueryClient: the
// chart reads the workspace calendar, and this file's contract is "given these
// hook results, what does the widget render".
vi.mock("@/hooks/auth/use-auth", () => ({
  useWorkspaceHolidays: () => holidays,
}));

vi.mock("@/hooks/workspace/use-dashboards", () => ({
  useDashboardMetrics: () => ({ data: metrics, ...metricsState }),
  useDashboardActivity: (_slug: string, params: Record<string, unknown>) => {
    lastActivityParams = params;
    return { data: activity, ...metricsState };
  },
  usePlannedWorkload: () => ({ data: planned, ...metricsState }),
}));
vi.mock("@/hooks/workspace/use-members", () => ({
  useMembers: () => ({
    data: [{ user_id: "u1", display_name: "Ada Lovelace", avatar_url: null }],
    isPending: false,
    isError: false,
  }),
}));
// The chart is vendored and canvas-dependent; assert we hand it the right data
// and sizing rather than pull a real renderer into jsdom.
vi.mock("@/components/charts", () => ({
  ComposedChart: ({
    data,
    aspectRatio,
    className,
    children,
  }: {
    data: unknown[];
    aspectRatio?: string;
    className?: string;
    children?: React.ReactNode;
  }) => (
    <div
      data-testid="chart"
      data-points={data.length}
      data-aspect={aspectRatio}
      className={className}
    >
      {children}
    </div>
  ),
  Area: () => null,
  Line: ({ dataKey }: { dataKey: string }) => (
    <div data-testid="line" data-key={dataKey} />
  ),
  Grid: () => null,
  XAxis: ({ numTicks }: { numTicks?: number }) => (
    <div data-testid="x-axis" data-ticks={numTicks} />
  ),
  YAxis: ({ numTicks }: { numTicks?: number }) => (
    <div data-testid="y-axis" data-ticks={numTicks} />
  ),
  ChartTooltip: () => null,
}));
vi.mock("@/components/charts/primitives/series-bar", () => ({
  SeriesBar: ({ dataKey }: { dataKey: string }) => (
    <div data-testid="bar" data-key={dataKey} />
  ),
}));

/**
 * jsdom has no ResizeObserver and never lays anything out, so a chart body would
 * sit at its 0x0 initial box forever. Capture the callback per instance and let
 * a test push a box through it.
 */
const observers: ((rect: { width: number; height: number }) => void)[] = [];
globalThis.ResizeObserver = class {
  constructor(cb: ResizeObserverCallback) {
    observers.push((rect) =>
      cb([{ contentRect: rect } as ResizeObserverEntry], this as unknown as ResizeObserver),
    );
  }
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

/** Report `rect` to every mounted observer and flush the queued frame. */
async function resizeTo(rect: { width: number; height: number }) {
  await act(async () => {
    for (const fire of observers) fire(rect);
    await new Promise((r) => requestAnimationFrame(r));
  });
}

import { AssigneeActivityBody } from "./assignee-activity-body";
import { DailyActivityBody } from "./daily-activity-body";
import { IntroductionBody } from "./introduction-body";
import { LabelsBody } from "./labels-body";
import { PlannedWorkloadBody } from "./planned-workload-body";

const baseMetrics = (over: Partial<IDashboardMetrics> = {}): IDashboardMetrics => ({
  total: 0,
  open: 0,
  status_counts: {},
  priority_counts: {},
  assignee_counts: {},
  assignee_status_counts: {},
  label_counts: [],
  ...over,
});

/** `days` activity points, each carrying one item on every series. */
const denseActivity = (days: number): IDashboardActivity => ({
  period_from: "2026-07-01",
  period_to: "2026-07-01",
  bucket: EChartBucket.Day,
  daily: Array.from({ length: days }, (_, i) => ({
    date: `2026-07-${String(i + 1).padStart(2, "0")}`,
    created: 1,
    updated: 1,
    completed: 1,
  })),
});

afterEach(() => {
  cleanup();
  observers.length = 0;
  push.mockClear();
  lastActivityParams = {};
  metricsState = { isPending: false, isError: false };
  holidays = new Set();
});

describe("non-working days", () => {
  /** 2026-07-01 is a Wednesday, so a 7-day run covers one weekend (4th/5th). */
  it("leaves the weekend out of the chart", () => {
    activity = denseActivity(7);
    render(<DailyActivityBody workspaceSlug="acme" />);
    expect(screen.getByTestId("chart")).toHaveAttribute("data-points", "5");
  });

  it("leaves the workspace's holidays out too", () => {
    activity = denseActivity(7);
    holidays = new Set(["2026-07-02"]);
    render(<DailyActivityBody workspaceSlug="acme" />);
    expect(screen.getByTestId("chart")).toHaveAttribute("data-points", "4");
  });

  it("applies to planned workload as well, not just activity", () => {
    planned = {
      period_from: "2026-07-01",
      period_to: "2026-07-07",
      bucket: EChartBucket.Day,
      daily: Array.from({ length: 7 }, (_, i) => ({
        date: `2026-07-${String(i + 1).padStart(2, "0")}`,
        starting: 1,
        due: 1,
        overdue: 0,
      })),
    };
    render(<PlannedWorkloadBody workspaceSlug="acme" />);
    expect(screen.getByTestId("chart")).toHaveAttribute("data-points", "5");
  });
});

describe("AssigneeActivityBody", () => {
  it("renders a row per assignee with a cell per status, heaviest first", () => {
    metrics = baseMetrics({
      total: 9,
      assignee_counts: { u1: 3, unassigned: 6 },
      assignee_status_counts: {
        u1: { todo: 1, in_progress: 1, in_review: 0, done: 1 },
        unassigned: { todo: 4, in_progress: 0, in_review: 1, done: 1 },
      },
    });
    render(<AssigneeActivityBody workspaceSlug="acme" />);

    const rows = screen.getAllByRole("row").slice(1); // drop the header
    expect(rows).toHaveLength(2);
    // Unassigned (6) outranks Ada (3), so it sorts first.
    expect(rows[0]).toHaveTextContent("Unassigned");
    expect(rows[1]).toHaveTextContent("Ada Lovelace");
    // Row totals are the sum of their status cells.
    expect(rows[0]).toHaveTextContent("6");
    expect(rows[1]).toHaveTextContent("3");
  });

  it("resolves an unknown assignee id rather than rendering the raw uuid", () => {
    metrics = baseMetrics({
      total: 1,
      assignee_counts: { ghost: 1 },
      assignee_status_counts: { ghost: { todo: 1, in_progress: 0, in_review: 0, done: 0 } },
    });
    render(<AssigneeActivityBody workspaceSlug="acme" />);
    expect(screen.getByText("Unknown")).toBeInTheDocument();
    expect(screen.queryByText("ghost")).not.toBeInTheDocument();
  });

  it("shows an empty message instead of a bare table", () => {
    metrics = baseMetrics();
    render(<AssigneeActivityBody workspaceSlug="acme" />);
    expect(screen.getByText(/no work items match/i)).toBeInTheDocument();
  });
});

describe("DailyActivityBody", () => {
  it("passes one chart point per period", () => {
    activity = denseActivity(2);
    render(<DailyActivityBody workspaceSlug="acme" />);
    expect(screen.getByTestId("chart")).toHaveAttribute("data-points", "2");
  });

  it("charts events only — created, updated and completed", () => {
    activity = denseActivity(30);
    render(<DailyActivityBody workspaceSlug="acme" />);
    const keys = screen.getAllByTestId("bar").map((n) => n.getAttribute("data-key"));
    expect(keys).toEqual(["created", "updated", "completed"]);
    // Scheduled dates belong to the Planned workload widget (GIN-527).
    expect(screen.queryByText("Due")).not.toBeInTheDocument();
    expect(screen.queryByText("Starting")).not.toBeInTheDocument();
  });

  it("says so when the window is all zeroes, rather than drawing a flat chart", () => {
    activity = {
      period_from: "2026-07-16",
      period_to: "2026-07-16",
      bucket: EChartBucket.Day,
      daily: [{ date: "2026-07-16", created: 0, updated: 0, completed: 0 }],
    };
    render(<DailyActivityBody workspaceSlug="acme" />);
    expect(screen.getByText(/no work-item activity/i)).toBeInTheDocument();
    expect(screen.queryByTestId("chart")).not.toBeInTheDocument();
  });

  it("keeps the period control usable while loading and on error", () => {
    activity = denseActivity(5);
    metricsState = { isPending: true, isError: false };
    const { rerender } = render(<DailyActivityBody workspaceSlug="acme" />);
    expect(screen.getByRole("group", { name: /chart period/i })).toBeInTheDocument();

    metricsState = { isPending: false, isError: true };
    rerender(<DailyActivityBody workspaceSlug="acme" key="err" />);
    expect(screen.getByRole("group", { name: /chart period/i })).toBeInTheDocument();
    expect(screen.getByText(/couldn't load activity/i)).toBeInTheDocument();
  });

  describe("period switching", () => {
    it("draws grouped columns at every period, never a line", async () => {
      activity = denseActivity(30);
      render(<DailyActivityBody workspaceSlug="acme" />);
      expect(screen.getAllByTestId("bar")).toHaveLength(3);
      expect(screen.queryAllByTestId("line")).toHaveLength(0);

      for (const period of ["7d", "90d"]) {
        await act(async () => {
          screen.getByRole("button", { name: period }).click();
        });
        expect(screen.getAllByTestId("bar")).toHaveLength(3);
        expect(screen.queryAllByTestId("line")).toHaveLength(0);
      }
    });

    it("asks the server for the period's window and bucketing", async () => {
      activity = denseActivity(30);
      render(<DailyActivityBody workspaceSlug="acme" />);
      expect(lastActivityParams.bucket).toBe(EChartBucket.Day);

      await act(async () => {
        screen.getByRole("button", { name: "90d" }).click();
      });
      // A quarter of daily points is unreadable, so it comes back by week.
      expect(lastActivityParams.bucket).toBe(EChartBucket.Week);
      expect(lastActivityParams.date_from).toBeTruthy();
    });

    it("starts from the widget's stored range", () => {
      activity = denseActivity(7);
      render(
        <DailyActivityBody
          workspaceSlug="acme"
          settings={{ date_range: EWidgetDateRange.Last7 }}
        />,
      );
      expect(screen.getByRole("button", { name: "7d" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(screen.getAllByTestId("bar")).toHaveLength(3);
    });
  });

  describe("series visibility", () => {
    it("hides a series from the chart when its legend entry is switched off", async () => {
      activity = denseActivity(30);
      render(<DailyActivityBody workspaceSlug="acme" />);
      expect(screen.getAllByTestId("bar")).toHaveLength(3);

      await act(async () => {
        screen.getByRole("button", { name: /created/i }).click();
      });
      const keys = screen.getAllByTestId("bar").map((n) => n.getAttribute("data-key"));
      expect(keys).toEqual(["updated", "completed"]);
      expect(screen.getByRole("button", { name: /created/i })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    });

    it("rescales the y-axis to the series still shown", async () => {
      // `created` dwarfs the rest; hiding it must let the small series breathe.
      activity = {
        period_from: "2026-07-01",
        period_to: "2026-07-02",
        bucket: EChartBucket.Day,
        daily: [
          { date: "2026-07-01", created: 40, updated: 2, completed: 1 },
          { date: "2026-07-02", created: 30, updated: 3, completed: 2 },
        ],
      };
      render(<DailyActivityBody workspaceSlug="acme" />);
      expect(screen.getByTestId("y-axis")).toHaveAttribute("data-ticks", "5");

      await act(async () => {
        screen.getByRole("button", { name: /created/i }).click();
      });
      // Max is now 3, so the axis asks for 3 ticks and stays on whole numbers.
      expect(screen.getByTestId("y-axis")).toHaveAttribute("data-ticks", "3");
    });

    it("refuses to hide the last visible series", async () => {
      activity = denseActivity(30);
      render(<DailyActivityBody workspaceSlug="acme" />);

      for (const name of [/created/i, /updated/i, /completed/i]) {
        await act(async () => {
          screen.getByRole("button", { name }).click();
        });
      }
      // An empty chart isn't a state worth reaching by clicking.
      expect(screen.getAllByTestId("bar")).toHaveLength(1);
    });
  });

  describe("drill-down", () => {
    it("opens the matching work items for the period that was clicked", async () => {
      activity = denseActivity(3);
      render(
        <DailyActivityBody workspaceSlug="acme" settings={{ project_id: "p1" }} />,
      );
      await resizeTo({ width: 600, height: 260 });

      await act(async () => {
        screen.getAllByRole("button", { name: /open created for/i })[1].click();
      });
      expect(push).toHaveBeenCalledWith(
        `/acme/projects/p1/issues?gigsql=${encodeURIComponent(
          "created:2026-07-02..2026-07-02",
        )}`,
      );
    });

    it("follows the visible series, so the legend decides what a click opens", async () => {
      activity = denseActivity(3);
      render(
        <DailyActivityBody workspaceSlug="acme" settings={{ project_id: "p1" }} />,
      );
      await resizeTo({ width: 600, height: 260 });

      await act(async () => {
        screen.getByRole("button", { name: /^created$/i }).click();
      });
      await act(async () => {
        // `updated` has no queryable field, so `completed` is the first that does.
        screen.getAllByRole("button", { name: /open completed for/i })[0].click();
      });
      expect(push).toHaveBeenCalledWith(
        `/acme/projects/p1/issues?gigsql=${encodeURIComponent("status:done")}`,
      );
    });

    it("offers no click target when there is no project-scoped list to open", async () => {
      activity = denseActivity(3);
      render(<DailyActivityBody workspaceSlug="acme" />);
      await resizeTo({ width: 600, height: 260 });
      expect(screen.queryByRole("button", { name: /open created for/i })).toBeNull();
    });
  });

  // GIN-527 — the chart must take its size from the card, not from a fixed
  // aspect ratio that derives height from width and overflows the wider it gets.
  describe("responsive sizing", () => {
    it("fills its container instead of holding an aspect ratio", () => {
      activity = denseActivity(30);
      render(<DailyActivityBody workspaceSlug="acme" />);
      const chart = screen.getByTestId("chart");
      expect(chart).toHaveAttribute("data-aspect", "auto");
      expect(chart).toHaveClass("h-full");
    });

    it("thins the date ticks as the widget narrows", async () => {
      activity = denseActivity(30);
      render(<DailyActivityBody workspaceSlug="acme" />);

      await resizeTo({ width: 720, height: 260 });
      expect(screen.getByTestId("x-axis")).toHaveAttribute("data-ticks", "8");

      await resizeTo({ width: 240, height: 260 });
      expect(screen.getByTestId("x-axis")).toHaveAttribute("data-ticks", "3");

      // Never below the two ticks the axis needs for a domain.
      await resizeTo({ width: 40, height: 260 });
      expect(screen.getByTestId("x-axis")).toHaveAttribute("data-ticks", "2");
    });

    it("drops the axis strip and legend when the card is too short to carry them", async () => {
      activity = denseActivity(30);
      render(<DailyActivityBody workspaceSlug="acme" />);

      await resizeTo({ width: 600, height: 260 });
      expect(screen.getByTestId("x-axis")).toBeInTheDocument();

      await resizeTo({ width: 600, height: 90 });
      expect(screen.queryByTestId("x-axis")).not.toBeInTheDocument();
      // The plot itself stays — a compact chart, not a clipped one.
      expect(screen.getByTestId("chart")).toBeInTheDocument();

      await resizeTo({ width: 600, height: 260 });
      expect(screen.getByTestId("x-axis")).toBeInTheDocument();
    });

    it("does not re-render on a resize that reports the same box", async () => {
      activity = denseActivity(30);
      render(<DailyActivityBody workspaceSlug="acme" />);

      await resizeTo({ width: 600, height: 260 });
      const first = screen.getByTestId("chart");
      await resizeTo({ width: 600, height: 260 });
      // Same node, not a remount — repeated resizes must not churn the chart.
      expect(screen.getByTestId("chart")).toBe(first);
    });
  });
});

describe("PlannedWorkloadBody", () => {
  const densePlanned = (days: number): IPlannedWorkload => ({
    period_from: "2026-07-01",
    period_to: "2026-07-01",
    bucket: EChartBucket.Day,
    daily: Array.from({ length: days }, (_, i) => ({
      date: `2026-07-${String(i + 1).padStart(2, "0")}`,
      starting: 1,
      due: 1,
      overdue: 1,
    })),
  });

  it("charts the schedule, never the activity series", () => {
    planned = densePlanned(30);
    render(<PlannedWorkloadBody workspaceSlug="acme" />);
    const keys = screen.getAllByTestId("bar").map((n) => n.getAttribute("data-key"));
    expect(keys).toEqual(["starting", "due", "overdue"]);
    expect(screen.queryByText("Created")).not.toBeInTheDocument();
    expect(screen.queryByText("Completed")).not.toBeInTheDocument();
  });

  it("uses the same responsive shell as the activity chart", () => {
    planned = densePlanned(10);
    render(<PlannedWorkloadBody workspaceSlug="acme" />);
    expect(screen.getByTestId("chart")).toHaveAttribute("data-aspect", "auto");
    expect(screen.getByRole("group", { name: /chart period/i })).toBeInTheDocument();
  });

  it("has its own empty message rather than the activity one", () => {
    planned = {
      period_from: "2026-07-16",
      period_to: "2026-07-16",
      bucket: EChartBucket.Day,
      daily: [{ date: "2026-07-16", starting: 0, due: 0, overdue: 0 }],
    };
    render(<PlannedWorkloadBody workspaceSlug="acme" />);
    expect(screen.getByText(/nothing scheduled/i)).toBeInTheDocument();
  });

  it("drills into the due window that was clicked", async () => {
    planned = densePlanned(3);
    render(<PlannedWorkloadBody workspaceSlug="acme" settings={{ project_id: "p1" }} />);
    await resizeTo({ width: 600, height: 260 });

    // `starting` has no queryable field, so `due` is the first that does.
    await act(async () => {
      screen.getAllByRole("button", { name: /open due for/i })[0].click();
    });
    expect(push).toHaveBeenCalledWith(
      `/acme/projects/p1/issues?gigsql=${encodeURIComponent("due:2026-07-01..2026-07-01")}`,
    );
  });
});

describe("LabelsBody", () => {
  it("renders each label with its count", () => {
    metrics = baseMetrics({
      label_counts: [{ id: "l1", name: "bug", color: "#ef4444", count: 4 }],
    });
    render(<LabelsBody workspaceSlug="acme" />);
    expect(screen.getByText("bug")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });
});

describe("IntroductionBody", () => {
  it("prompts for text when unset and renders it once set", () => {
    const { rerender } = render(<IntroductionBody />);
    expect(screen.getByText(/add a message/i)).toBeInTheDocument();

    rerender(<IntroductionBody settings={{ text: "Read the runbook first." }} />);
    expect(screen.getByText("Read the runbook first.")).toBeInTheDocument();
  });

  it("treats whitespace-only text as empty", () => {
    render(<IntroductionBody settings={{ text: "   \n  " }} />);
    expect(screen.getByText(/add a message/i)).toBeInTheDocument();
  });
});
