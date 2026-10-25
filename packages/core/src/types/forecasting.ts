/** Forecasting API contract (GIN-333/334/335) — mirrors the backend
 *  features/forecasting schemas. Dates are ISO strings; null where the backend
 *  is honest about missing data rather than inventing a value. */

export interface IThroughputBucket {
  period_start: string;
  period_end: string;
  completed: number;
}

export interface ICycleTime {
  samples: number;
  p50_days: number | null;
  p85_days: number | null;
  confidence: string;
}

export interface IScope {
  total: number;
  remaining: number;
  delivered: number;
  cancelled: number;
}

export interface IDeliveryMetrics {
  project_id: string;
  period_days: number;
  generated_at: string;
  throughput: IThroughputBucket[];
  cycle_time: ICycleTime;
  scope: IScope;
  data_quality: string;
  approximate_share: number;
}

export interface IForecast {
  forecastable: boolean;
  reason: string | null;
  confidence: string; // "no_data" | "low" | "medium" | "high"
  confidence_reasons: string[];
  algorithm_version: string;
  remaining_units: number;
  sample_periods: number;
  trials: number;
  period_days: number;
  p50_periods: number | null;
  p85_periods: number | null;
  p95_periods: number | null;
  p50_date: string | null;
  p85_date: string | null;
  p95_date: string | null;
  data_quality: string;
  generated_at: string;
}

export interface IHealthReason {
  code: string;
  explanation: string;
  metric: number | string | null;
  contributing_ids: string[];
}

export interface IRecommendation {
  action: string;
  title: string;
  rationale: string;
  assumption: string;
  decision_needed: string;
  impact: string;
  contributing_ids: string[];
}

export type TPmHealthStatus = "on_track" | "at_risk" | "off_track";

export interface IPmHealthUpdate {
  id: string;
  project_id: string;
  reported_status: TPmHealthStatus;
  narrative: string;
  key_risks: string | null;
  next_milestone: string | null;
  next_milestone_date: string | null;
  decision_needed: string | null;
  recovery_owner_id: string | null;
  next_review_date: string | null;
  work_item_refs: string[] | null;
  author_id: string | null;
  author_name: string;
  retracted_at: string | null;
  created_at: string;
}

export interface ICreatePmHealthUpdate {
  reported_status: TPmHealthStatus;
  narrative: string;
  key_risks?: string | null;
  decision_needed?: string | null;
}

export interface IHealth {
  status: string; // "no_data" | "on_track" | "at_risk" | "off_track"
  reasons: IHealthReason[];
  recommendations: IRecommendation[];
  rules_version: string;
  recovery_version: string;
  confidence: string;
  forecast_vs_target: string | null;
  remaining_units: number;
  generated_at: string;
}
