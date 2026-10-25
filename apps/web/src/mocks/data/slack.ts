import type { ISlackChannel, ISlackStatus } from "@/types";

/** Per-workspace Slack connection mock state (GIN-23a) — kept separate from
 * the IWorkspace fixture, mirroring the backend's dedicated SlackConnection
 * table (not fields denormalized onto Workspace). */
export interface IMockSlackConnection {
  workspace_slug: string;
  team_name: string;
  default_channel_id: string | null;
  default_channel_name: string | null;
  notify_events: string[];
}

export const slackConnections: IMockSlackConnection[] = [];

export const MOCK_SLACK_CHANNELS: ISlackChannel[] = [
  { id: "C-GENERAL", name: "general" },
  { id: "C-ENG", name: "engineering" },
  { id: "C-ALERTS", name: "alerts" },
];

export function slackStatus(slug: string): ISlackStatus {
  const conn = slackConnections.find((c) => c.workspace_slug === slug);
  if (!conn) {
    return { connected: false, team_name: null, default_channel_name: null, notify_events: [] };
  }
  return {
    connected: true,
    team_name: conn.team_name,
    default_channel_name: conn.default_channel_name,
    notify_events: conn.notify_events,
  };
}
