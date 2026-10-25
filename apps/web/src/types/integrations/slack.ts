/** Mirrors IGitHubStatus's shape (workspace.service.ts) for the Slack OAuth
 * bot-token connection (GIN-23a) — one Slack workspace install per GigsNano
 * workspace, notify_events a subset of the webhook event catalog. */
export interface ISlackStatus {
  connected: boolean;
  team_name: string | null;
  default_channel_name: string | null;
  notify_events: string[];
}

export interface ISlackChannel {
  id: string;
  name: string;
}

export interface IUpdateSlackConfigPayload {
  default_channel_id?: string;
  default_channel_name?: string;
  notify_events?: string[];
}
