import type { EAgentRunState, IAgentRun, IAgentRunStep } from "@/types/story/agent-run";

/**
 * How a run is DISPLAYED, which is not the same as the state the backend last
 * wrote (GIN-482).
 *
 * `stale` exists because a run whose backend went away is not "running forever"
 * — it is a run nobody is driving, and saying so is the only honest thing the
 * UI can do. GIN-478 was this exact bug one layer up: a tool call with no
 * terminal event span an infinite spinner. The fix there was a guard; the fix
 * here is structural — **every active state has a timeout edge out of it**, so
 * no display state depends on a backend message that may never arrive.
 */
export type TAgentRunDisplayState = EAgentRunState | "stale";

/** States the backend is actively driving. Only these can go stale. */
const ACTIVE_STATES: EAgentRunState[] = ["queued", "planning", "executing"];

/**
 * States that are parked, not stuck. `awaiting_review` waits on a HUMAN, so it
 * must never be called stale — the run is exactly where it should be.
 */
const TERMINAL_STATES: EAgentRunState[] = ["done", "failed", "stopped"];

/**
 * How long a run may go without the backend touching it before the UI stops
 * claiming it is running.
 *
 * ponytail: one flat window for every state. A long single tool call is the
 * false-positive risk, hence five minutes rather than the ten seconds Linear
 * gives an agent session's first activity. Per-state windows (queued short,
 * executing long) if that proves too blunt.
 */
export const RUN_STALE_AFTER_MS = 5 * 60 * 1000;

export function isActiveRunState(state: EAgentRunState): boolean {
  return ACTIVE_STATES.includes(state);
}

export function isTerminalRunState(state: TAgentRunDisplayState): boolean {
  return state === "stale" || TERMINAL_STATES.includes(state as EAgentRunState);
}

/**
 * The state to render for `run` as of `nowMs`. Pure, so "does this spin
 * forever?" is a question a test can answer.
 */
export function runDisplayState(run: IAgentRun, nowMs: number): TAgentRunDisplayState {
  if (!isActiveRunState(run.state)) return run.state;
  const touchedAt = Date.parse(run.updated_at);
  // An unparseable timestamp is not evidence of staleness — leave the run alone
  // rather than accusing a healthy agent because a date failed to parse.
  if (Number.isNaN(touchedAt)) return run.state;
  return nowMs - touchedAt >= RUN_STALE_AFTER_MS ? "stale" : run.state;
}

export const RUN_STATE_LABEL: Record<TAgentRunDisplayState, string> = {
  queued: "Queued",
  planning: "Planning",
  executing: "Running",
  awaiting_review: "Waiting for review",
  done: "Completed",
  failed: "Failed",
  stopped: "Stopped",
  stale: "Stalled",
};

/** Semantic ramp only — never the accent colour, which belongs to the primary CTA. */
export const RUN_STATE_TONE: Record<TAgentRunDisplayState, "neutral" | "busy" | "attention" | "bad"> =
  {
    queued: "neutral",
    planning: "busy",
    executing: "busy",
    awaiting_review: "attention",
    done: "neutral",
    failed: "bad",
    stopped: "neutral",
    stale: "bad",
  };

export interface IRunProgress {
  /** Steps taken so far, newest last. */
  steps: IAgentRunStep[];
  /** The step the run is sitting on: an error, an approval gate, or the last one. */
  current: IAgentRunStep | null;
  /** 1-based index of `current`, for "step 3". */
  currentIndex: number;
  errorCount: number;
  awaitingApproval: boolean;
}

/**
 * Progress for one run.
 *
 * Note this is RETROSPECTIVE — steps already taken. A prospective plan ("7
 * steps, we're on 3") needs the agent to declare its intended steps up front,
 * which the backend does not emit today: `orchestrate()` writes a single
 * `PLAN` step reading "Planning the work". Showing "of 7" would be a number we
 * invented, so the UI shows "step 3" and what it is doing, and nothing more.
 */
export function runProgress(run: IAgentRun): IRunProgress {
  const steps = [...run.steps].sort((a, b) => a.seq - b.seq);
  const gate = steps.findIndex((s) => s.status === "awaiting_approval");
  const error = steps.findIndex((s) => s.status === "error");
  const index = gate >= 0 ? gate : error >= 0 ? error : steps.length - 1;

  return {
    steps,
    current: index >= 0 ? steps[index] : null,
    currentIndex: index + 1,
    errorCount: steps.filter((s) => s.status === "error").length,
    awaitingApproval: gate >= 0,
  };
}

/**
 * The badge for the Runs tab, or null when there is nothing worth saying.
 * Never a zero — a count of nothing is noise dressed as information.
 */
export function runsTabBadge(runs: IAgentRun[] | undefined, nowMs: number): string | null {
  if (!runs?.length) return null;
  const states = runs.map((r) => runDisplayState(r, nowMs));
  if (states.includes("failed")) return "Failed";
  if (states.includes("stale")) return "Stalled";
  if (states.includes("awaiting_review")) return "Review";
  if (states.some((s) => s === "executing" || s === "planning" || s === "queued")) return "Running";
  return null;
}
