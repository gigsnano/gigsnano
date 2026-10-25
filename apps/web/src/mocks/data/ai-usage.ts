import { EAiOperation, type IThreadUsage, type IWorkspaceUsageSummary } from "@/types/billing/ai-cost";

const MODEL = "claude-sonnet-4-20250514";

/** Deterministic per-thread receipt fixture: a few turns with plausible sub-dollar costs. */
export function getThreadUsage(threadId: string): IThreadUsage {
  const lines = [
    { cost_cents: 0.6, input: 1200, output: 320 },
    { cost_cents: 1.8, input: 2100, output: 540 },
    { cost_cents: 2.4, input: 2600, output: 700 },
  ].map((row, i) => ({
    id: `aiu_${threadId}_${i}`,
    source: "bmad_story",
    operation: EAiOperation.ChatTurn,
    model: MODEL,
    input_tokens: row.input,
    output_tokens: row.output,
    cost_cents: row.cost_cents,
    project_id: null,
    story_id: null,
    thread_id: threadId,
    created_at: `2026-07-05T1${i}:00:00.000Z`,
  }));
  return {
    thread_id: threadId,
    total_cost_cents: lines.reduce((sum, l) => sum + l.cost_cents, 0),
    message_count: lines.length,
    lines,
  };
}

/** Deterministic 14-day workspace summary. */
export function getWorkspaceUsage(_slug: string): IWorkspaceUsageSummary {
  const days = 14;
  const DAY_MS = 86_400_000;
  const start = new Date("2026-06-22T00:00:00.000Z");
  const timeseries = Array.from({ length: days }, (_, i) => {
    const date = new Date(start.getTime() + i * DAY_MS).toISOString().slice(0, 10);
    // Stable pseudo-variation without Date.now()/Math.random().
    const cost_cents = 40 + ((i * 37) % 90);
    return { date, cost_cents };
  });
  const total_cost_cents = timeseries.reduce((sum, p) => sum + p.cost_cents, 0);
  return {
    period: { from: "2026-06-22", to: "2026-07-05" },
    total_cost_cents,
    event_count: 128,
    by_project: [
      { id: "prj_mba", name: "Meeting Buddy", cost_cents: 640, event_count: 74 },
      { id: "prj_2", name: "Orbital Retail", cost_cents: 410, event_count: 38 },
      { id: "prj_3", name: "Nimbus Docs", cost_cents: 180, event_count: 16 },
    ],
    by_agent: [
      { id: "pm", name: "Product Manager", cost_cents: 520, event_count: 52 },
      { id: "arch", name: "Architect", cost_cents: 430, event_count: 34 },
      { id: "analyst", name: "Analyst", cost_cents: 280, event_count: 42 },
    ],
    by_member: [
      { id: "u_1", name: "Ada Lovelace", cost_cents: 700, event_count: 80 },
      { id: "u_2", name: "Grace Hopper", cost_cents: 530, event_count: 48 },
    ],
    timeseries,
    prior_period: { total_cost_cents: 980, delta_cost_pct: 0.28 },
  };
}
