import { describe, expect, it } from "vitest";

import type { EAgentRunState, IAgentRun, IAgentRunStep } from "@/types/story/agent-run";

import {
  isTerminalRunState,
  RUN_STALE_AFTER_MS,
  runDisplayState,
  runProgress,
  runsTabBadge,
} from "./agent-run-state";

const NOW = Date.parse("2026-07-25T12:00:00Z");

const run = (state: EAgentRunState, agoMs = 0, steps: Partial<IAgentRunStep>[] = []): IAgentRun =>
  ({
    id: `run-${state}-${agoMs}`,
    state,
    updated_at: new Date(NOW - agoMs).toISOString(),
    steps: steps.map((s, i) => ({ id: `s${i}`, seq: i, status: "ok", summary: "", ...s })),
  }) as IAgentRun;

const ALL_STATES: EAgentRunState[] = [
  "queued",
  "planning",
  "executing",
  "awaiting_review",
  "done",
  "failed",
  "stopped",
];

describe("runDisplayState", () => {
  it("passes a freshly-touched run through unchanged", () => {
    for (const state of ALL_STATES) {
      expect(runDisplayState(run(state, 1000), NOW)).toBe(state);
    }
  });

  it("stalls every active state once the window elapses", () => {
    for (const state of ["queued", "planning", "executing"] as EAgentRunState[]) {
      expect(runDisplayState(run(state, RUN_STALE_AFTER_MS), NOW)).toBe("stale");
    }
  });

  it("never stalls a run that is parked on a human", () => {
    // awaiting_review is waiting on a reviewer, not on an agent that died.
    expect(runDisplayState(run("awaiting_review", RUN_STALE_AFTER_MS * 10), NOW)).toBe(
      "awaiting_review",
    );
  });

  it("never stalls a run that already finished", () => {
    for (const state of ["done", "failed", "stopped"] as EAgentRunState[]) {
      expect(runDisplayState(run(state, RUN_STALE_AFTER_MS * 10), NOW)).toBe(state);
    }
  });

  it("leaves a run alone when its timestamp is unparseable", () => {
    const broken = { ...run("executing"), updated_at: "not a date" };
    expect(runDisplayState(broken, NOW)).toBe("executing");
  });

  it("holds just inside the window and flips exactly on it", () => {
    expect(runDisplayState(run("executing", RUN_STALE_AFTER_MS - 1), NOW)).toBe("executing");
    expect(runDisplayState(run("executing", RUN_STALE_AFTER_MS), NOW)).toBe("stale");
  });

  // The guarantee GIN-478 was about: no state can spin forever waiting on a
  // message that never comes. Every state either is terminal already or has a
  // timeout edge into one.
  it("gives every state a terminal display state under an unbounded wait", () => {
    for (const state of ALL_STATES) {
      const display = runDisplayState(run(state, RUN_STALE_AFTER_MS * 100), NOW);
      const parked = display === "awaiting_review";
      expect(isTerminalRunState(display) || parked).toBe(true);
    }
  });
});

describe("runProgress", () => {
  it("has no current step for a run that has taken none", () => {
    const p = runProgress(run("queued"));
    expect(p.current).toBeNull();
    expect(p.currentIndex).toBe(0);
  });

  it("sits on the last step while running", () => {
    const p = runProgress(run("executing", 0, [{ summary: "read" }, { summary: "write" }]));
    expect(p.current?.summary).toBe("write");
    expect(p.currentIndex).toBe(2);
  });

  it("sits on an approval gate ahead of later steps", () => {
    const p = runProgress(
      run("awaiting_review", 0, [
        { summary: "read" },
        { summary: "confirm", status: "awaiting_approval" },
        { summary: "trailing note" },
      ]),
    );
    expect(p.current?.summary).toBe("confirm");
    expect(p.awaitingApproval).toBe(true);
  });

  it("sits on an error and counts them", () => {
    const p = runProgress(
      run("failed", 0, [{ summary: "read" }, { summary: "boom", status: "error" }]),
    );
    expect(p.current?.summary).toBe("boom");
    expect(p.errorCount).toBe(1);
    expect(p.awaitingApproval).toBe(false);
  });

  it("orders by seq, not by array position", () => {
    const r = run("executing");
    r.steps = [
      { id: "b", seq: 2, status: "ok", summary: "second" },
      { id: "a", seq: 1, status: "ok", summary: "first" },
    ] as IAgentRunStep[];
    expect(runProgress(r).steps.map((s) => s.summary)).toEqual(["first", "second"]);
  });
});

describe("runsTabBadge", () => {
  it("says nothing when there are no runs", () => {
    expect(runsTabBadge(undefined, NOW)).toBeNull();
    expect(runsTabBadge([], NOW)).toBeNull();
  });

  it("says nothing when every run has settled", () => {
    expect(runsTabBadge([run("done"), run("stopped")], NOW)).toBeNull();
  });

  it("ranks failure above everything else", () => {
    expect(runsTabBadge([run("executing"), run("failed")], NOW)).toBe("Failed");
  });

  it("surfaces a stalled run over a healthy one", () => {
    expect(runsTabBadge([run("executing"), run("executing", RUN_STALE_AFTER_MS)], NOW)).toBe(
      "Stalled",
    );
  });

  it("asks for review before reporting progress", () => {
    expect(runsTabBadge([run("queued"), run("awaiting_review")], NOW)).toBe("Review");
  });

  it("reports running work", () => {
    expect(runsTabBadge([run("done"), run("executing")], NOW)).toBe("Running");
  });
});
