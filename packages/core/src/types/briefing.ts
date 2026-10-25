import type { ID, ISODateString } from "./common";
import type { IInboxCounts } from "./inbox";

export type THealth = "no_data" | "on_track" | "at_risk" | "off_track";
export interface IBriefingCycle { id: ID; name: string; days_left: number }
export interface IBriefingChanges { done: number; created: number; overdue: number; docs_finalized: number }
export interface IBriefingProject {
  id: ID; name: string; identifier: string; logo_emoji: string | null;
  progress_pct: number; total: number; done: number; health: THealth;
  target_date: string; forecast_date: ISODateString | null; slip_days: number | null;
  cycle: IBriefingCycle | null; changes: IBriefingChanges;
}
export interface IBriefing { generated_at: ISODateString; since: ISODateString; needs_you: IInboxCounts; projects: IBriefingProject[] }
