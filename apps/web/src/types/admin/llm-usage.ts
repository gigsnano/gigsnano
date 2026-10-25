export interface ILlmUsageSummary {
  period: { from: string; to: string };
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
  event_count: number;
  by_source: Record<string, { tokens: number; cost_usd: number; count: number }>;
  by_operation: Record<string, { tokens: number; cost_usd: number; count: number }>;
  prior_period?: {
    total_tokens: number;
    estimated_cost_usd: number;
    event_count: number;
    delta_tokens_pct: number | null;
    delta_cost_pct: number | null;
  };
}

export interface ILlmUsageDailyCell {
  date: string;
  total_tokens: number;
  estimated_cost_usd: number;
  event_count: number;
}

export interface ILlmUsageHourlyCell {
  dow: number;
  hour: number;
  total_tokens: number;
  event_count: number;
}

export interface ILlmUsageMatrixRow {
  id: string;
  name: string;
  days: ILlmUsageDailyCell[];
  total_tokens: number;
  estimated_cost_usd: number;
}

export interface ILlmUsageTimeseriesPoint {
  date: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
  event_count: number;
}

export interface ILlmUsageRankedRow {
  id: string;
  name: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
  event_count: number;
}

import type { IOffsetPage } from "@/types/common";

export interface ILlmUsageEvent {
  id: string;
  workspace_id: string;
  workspace_name: string;
  user_id: string;
  user_display_name: string;
  source: string;
  operation: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number | null;
  project_id: string | null;
  story_id: string | null;
  thread_id: string | null;
  created_at: string;
}

export type ILlmUsageEventPage = IOffsetPage<ILlmUsageEvent>;

export interface ILlmUsageFilters {
  from?: string;
  to?: string;
  selected_date?: string;
  workspace_id?: string;
  user_id?: string;
  source?: string;
  operation?: string;
  model?: string;
  metric?: "tokens" | "cost";
  limit?: number;
  offset?: number;
}
