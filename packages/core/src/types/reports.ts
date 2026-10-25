import type { ID, ISODateString } from "./common";

export type TReportRange = "7d" | "30d" | "quarter";

export interface IReportBucket {
  /** ISO date the bucket starts on. */
  start: ISODateString;
  completed: number;
}

export interface IThroughput {
  total: number;
  previous_total: number;
  buckets: IReportBucket[];
}

export interface IOnTime {
  done_with_target: number;
  on_time: number;
  /** 0-100, null when nothing was due. */
  pct: number | null;
  previous_pct: number | null;
}

export interface IAtRisk {
  at_risk: number;
  off_track: number;
  total_projects: number;
}

export interface ITeamLoad {
  user_id: ID | null;
  display_name: string;
  open: number;
}

export interface ICycleReport {
  cycle_id: ID;
  cycle_name: string;
  project_id: ID;
  project_name: string;
  status: "active" | "completed";
  total: number;
  done: number;
  pct: number;
  end_date: ISODateString | null;
}

/** Mirrors the backend ReportsOut. */
export interface IReports {
  range: TReportRange;
  period_from: ISODateString;
  period_to: ISODateString;
  bucket: "day" | "week";
  throughput: IThroughput;
  on_time: IOnTime;
  at_risk: IAtRisk;
  team_load: ITeamLoad[];
  cycles: ICycleReport[];
}
