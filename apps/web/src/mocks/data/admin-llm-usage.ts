import type {
  ILlmUsageDailyCell,
  ILlmUsageEvent,
  ILlmUsageEventPage,
  ILlmUsageFilters,
  ILlmUsageHourlyCell,
  ILlmUsageMatrixRow,
  ILlmUsageRankedRow,
  ILlmUsageSummary,
  ILlmUsageTimeseriesPoint,
} from "@/types";

type LlmUsageSource = "bmad_story" | "gigs_ai";
type LlmUsageOperation = "stream_turn" | "extract" | "finalize_description";

const DAY_MS = 86_400_000;
const WINDOW_END = new Date("2026-07-05T23:59:59.000Z");
const WINDOW_START = new Date(WINDOW_END.getTime() - 29 * DAY_MS);

const WORKSPACES = [
  { id: "ws_1", name: "Acme Inc" },
  { id: "ws_2", name: "Nimbus Labs" },
  { id: "ws_3", name: "Northstar Studio" },
  { id: "ws_4", name: "Orbital Retail" },
] as const;

const USERS = [
  { id: "u_1", name: "Ada Lovelace" },
  { id: "u_2", name: "Grace Hopper" },
  { id: "u_3", name: "Alan Turing" },
  { id: "u_4", name: "Margaret Hamilton" },
  { id: "u_5", name: "Katherine Johnson" },
] as const;

const MODELS = [
  "claude-sonnet-4-20250514",
  "claude-3-5-haiku-20241022",
  "fake-provider",
] as const;

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dayRange(filters: ILlmUsageFilters) {
  if (filters.selected_date) {
    return {
      from: new Date(`${filters.selected_date}T00:00:00.000Z`),
      to: new Date(`${filters.selected_date}T23:59:59.999Z`),
    };
  }
  const from = filters.from ? new Date(filters.from) : WINDOW_START;
  const to = filters.to ? new Date(filters.to) : WINDOW_END;
  return { from, to };
}

function applyFilters(filters: ILlmUsageFilters) {
  const { from, to } = dayRange(filters);
  return EVENTS.filter((event) => {
    const at = new Date(event.created_at);
    if (at < from || at > to) return false;
    if (filters.workspace_id && event.workspace_id !== filters.workspace_id) return false;
    if (filters.user_id && event.user_id !== filters.user_id) return false;
    if (filters.source && event.source !== filters.source) return false;
    if (filters.operation && event.operation !== filters.operation) return false;
    if (filters.model && event.model !== filters.model) return false;
    return true;
  });
}

function aggregateSummary(events: ILlmUsageEvent[]) {
  const summary = {
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    estimated_cost_usd: 0,
    event_count: events.length,
    by_source: {} as ILlmUsageSummary["by_source"],
    by_operation: {} as ILlmUsageSummary["by_operation"],
  };

  for (const event of events) {
    summary.input_tokens += event.input_tokens;
    summary.output_tokens += event.output_tokens;
    summary.total_tokens += event.total_tokens;
    summary.estimated_cost_usd += event.estimated_cost_usd ?? 0;

    const sourceRow = summary.by_source[event.source] ?? { tokens: 0, cost_usd: 0, count: 0 };
    sourceRow.tokens += event.total_tokens;
    sourceRow.cost_usd += event.estimated_cost_usd ?? 0;
    sourceRow.count += 1;
    summary.by_source[event.source] = sourceRow;

    const opRow = summary.by_operation[event.operation] ?? { tokens: 0, cost_usd: 0, count: 0 };
    opRow.tokens += event.total_tokens;
    opRow.cost_usd += event.estimated_cost_usd ?? 0;
    opRow.count += 1;
    summary.by_operation[event.operation] = opRow;
  }

  return summary;
}

function buildDailyBuckets(filters: ILlmUsageFilters): ILlmUsageDailyCell[] {
  const { from, to } = dayRange(filters);
  const events = applyFilters(filters);
  const byDate = new Map<string, ILlmUsageDailyCell>();

  for (let cursor = new Date(from); cursor <= to; cursor = new Date(cursor.getTime() + DAY_MS)) {
    const key = toIsoDate(cursor);
    byDate.set(key, { date: key, total_tokens: 0, estimated_cost_usd: 0, event_count: 0 });
  }

  for (const event of events) {
    const key = event.created_at.slice(0, 10);
    const row = byDate.get(key);
    if (!row) continue;
    row.total_tokens += event.total_tokens;
    row.estimated_cost_usd += event.estimated_cost_usd ?? 0;
    row.event_count += 1;
  }

  return Array.from(byDate.values());
}

function mondayDow(date: Date) {
  return (date.getUTCDay() + 6) % 7;
}

function pctDelta(current: number, previous: number) {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

export const EVENTS: ILlmUsageEvent[] = Array.from({ length: 120 }, (_, index) => {
  const dayOffset = Math.floor(index / 4);
  const slot = index % 4;
  const day = new Date(WINDOW_END.getTime() - dayOffset * DAY_MS);
  day.setUTCHours(8 + slot * 4, 12, 0, 0);

  const workspace = WORKSPACES[(index + dayOffset) % WORKSPACES.length];
  const user = USERS[(index + slot) % USERS.length];
  const source: LlmUsageSource = slot % 3 === 0 ? "gigs_ai" : "bmad_story";
  const operation: LlmUsageOperation =
    slot === 1 ? "extract" : slot === 2 ? "finalize_description" : "stream_turn";
  const input = 500 + (dayOffset % 9) * 120 + slot * 65;
  const output = 260 + (dayOffset % 7) * 95 + slot * 42;
  const total = input + output;
  const model = MODELS[(index + slot) % MODELS.length];
  const cost =
    model === "fake-provider"
      ? null
      : Number((((input / 1_000_000) * 3 + (output / 1_000_000) * 15) * 1.05).toFixed(6));

  return {
    id: `llu_evt_${index + 1}`,
    workspace_id: workspace.id,
    workspace_name: workspace.name,
    user_id: user.id,
    user_display_name: user.name,
    source,
    operation,
    model,
    input_tokens: input,
    output_tokens: output,
    total_tokens: total,
    estimated_cost_usd: cost,
    project_id: `prj_${(index % 4) + 1}`,
    story_id: `story_${(index % 15) + 1}`,
    thread_id: `thr_${(index % 18) + 1}`,
    created_at: day.toISOString(),
  };
}).sort((a, b) => b.created_at.localeCompare(a.created_at));

export function getLlmUsageSummary(filters: ILlmUsageFilters = {}): ILlmUsageSummary {
  const period = dayRange(filters);
  const currentEvents = applyFilters(filters);
  const current = aggregateSummary(currentEvents);

  const durationMs = period.to.getTime() - period.from.getTime();
  const priorFilters: ILlmUsageFilters = {
    ...filters,
    selected_date: undefined,
    from: new Date(period.from.getTime() - durationMs - 1).toISOString(),
    to: new Date(period.to.getTime() - durationMs - 1).toISOString(),
  };
  const prior = aggregateSummary(applyFilters(priorFilters));

  return {
    period: { from: period.from.toISOString(), to: period.to.toISOString() },
    input_tokens: current.input_tokens,
    output_tokens: current.output_tokens,
    total_tokens: current.total_tokens,
    estimated_cost_usd: Number(current.estimated_cost_usd.toFixed(6)),
    event_count: current.event_count,
    by_source: current.by_source,
    by_operation: current.by_operation,
    prior_period: {
      total_tokens: prior.total_tokens,
      estimated_cost_usd: Number(prior.estimated_cost_usd.toFixed(6)),
      event_count: prior.event_count,
      delta_tokens_pct: pctDelta(current.total_tokens, prior.total_tokens),
      delta_cost_pct: pctDelta(current.estimated_cost_usd, prior.estimated_cost_usd),
    },
  };
}

export function getLlmUsageTimeseries(filters: ILlmUsageFilters = {}): ILlmUsageTimeseriesPoint[] {
  const byDate = new Map<string, ILlmUsageTimeseriesPoint>();
  for (const day of buildDailyBuckets(filters)) {
    byDate.set(day.date, {
      date: day.date,
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: day.total_tokens,
      estimated_cost_usd: Number(day.estimated_cost_usd.toFixed(6)),
      event_count: day.event_count,
    });
  }

  for (const event of applyFilters(filters)) {
    const key = event.created_at.slice(0, 10);
    const row = byDate.get(key);
    if (!row) continue;
    row.input_tokens += event.input_tokens;
    row.output_tokens += event.output_tokens;
  }

  return Array.from(byDate.values());
}

export function getLlmUsageHeatmapDaily(filters: ILlmUsageFilters = {}): ILlmUsageDailyCell[] {
  return buildDailyBuckets(filters).map((row) => ({
    ...row,
    estimated_cost_usd: Number(row.estimated_cost_usd.toFixed(6)),
  }));
}

export function getLlmUsageHeatmapHourly(filters: ILlmUsageFilters = {}): ILlmUsageHourlyCell[] {
  const cells: ILlmUsageHourlyCell[] = [];
  for (let dow = 0; dow < 7; dow += 1) {
    for (let hour = 0; hour < 24; hour += 1) {
      cells.push({ dow, hour, total_tokens: 0, event_count: 0 });
    }
  }

  for (const event of applyFilters(filters)) {
    const at = new Date(event.created_at);
    const key = mondayDow(at) * 24 + at.getUTCHours();
    cells[key].total_tokens += event.total_tokens;
    cells[key].event_count += 1;
  }

  return cells;
}

function buildRanked(
  filters: ILlmUsageFilters,
  groupBy: "workspace_id" | "user_id",
  labelKey: "workspace_name" | "user_display_name",
) {
  const grouped = new Map<string, ILlmUsageRankedRow>();

  for (const event of applyFilters(filters)) {
    const id = event[groupBy];
    const name = event[labelKey];
    const row = grouped.get(id) ?? {
      id,
      name,
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
      estimated_cost_usd: 0,
      event_count: 0,
    };
    row.input_tokens += event.input_tokens;
    row.output_tokens += event.output_tokens;
    row.total_tokens += event.total_tokens;
    row.estimated_cost_usd += event.estimated_cost_usd ?? 0;
    row.event_count += 1;
    grouped.set(id, row);
  }

  const limit = filters.limit ?? 10;
  return Array.from(grouped.values())
    .sort((a, b) => b.total_tokens - a.total_tokens)
    .slice(0, limit)
    .map((row) => ({ ...row, estimated_cost_usd: Number(row.estimated_cost_usd.toFixed(6)) }));
}

export function getLlmUsageByWorkspace(filters: ILlmUsageFilters = {}) {
  return buildRanked(filters, "workspace_id", "workspace_name");
}

export function getLlmUsageByUser(filters: ILlmUsageFilters = {}) {
  return buildRanked(filters, "user_id", "user_display_name");
}

export function getLlmUsageMatrix(filters: ILlmUsageFilters = {}): ILlmUsageMatrixRow[] {
  const basis = getLlmUsageByWorkspace(filters);
  const sevenDayTo = dayRange(filters).to;
  const sevenDayFrom = new Date(sevenDayTo.getTime() - 6 * DAY_MS);
  const matrixFilters: ILlmUsageFilters = {
    ...filters,
    selected_date: undefined,
    from: sevenDayFrom.toISOString(),
    to: sevenDayTo.toISOString(),
  };
  const allRows = buildDailyBuckets(matrixFilters);

  return basis.map((row) => {
    const dayMap = new Map<string, ILlmUsageDailyCell>();
    for (const day of allRows) {
      dayMap.set(day.date, { ...day, total_tokens: 0, estimated_cost_usd: 0, event_count: 0 });
    }
    const events = applyFilters({ ...matrixFilters, workspace_id: row.id });
    for (const event of events) {
      const key = event.created_at.slice(0, 10);
      const day = dayMap.get(key);
      if (!day) continue;
      day.total_tokens += event.total_tokens;
      day.estimated_cost_usd += event.estimated_cost_usd ?? 0;
      day.event_count += 1;
    }
    return {
      id: row.id,
      name: row.name,
      days: Array.from(dayMap.values()).map((day) => ({
        ...day,
        estimated_cost_usd: Number(day.estimated_cost_usd.toFixed(6)),
      })),
      total_tokens: row.total_tokens,
      estimated_cost_usd: Number(row.estimated_cost_usd.toFixed(6)),
    };
  });
}

export function getLlmUsageEvents(filters: ILlmUsageFilters = {}): ILlmUsageEventPage {
  const limit = filters.limit ?? 20;
  const offset = filters.offset ?? 0;
  const rows = applyFilters(filters);
  return {
    items: rows.slice(offset, offset + limit),
    total: rows.length,
    limit,
    offset,
  };
}
