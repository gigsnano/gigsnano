import { APIError } from "@/services/api-error";

import { MOCK_SLACK_CHANNELS, slackConnections, slackStatus } from "../data/slack";

type Handler = {
  method: string;
  pattern: RegExp;
  resolve: (match: RegExpMatchArray, body: unknown) => unknown;
};

const clone = <T>(value: T): T => structuredClone(value);

const WEBHOOK_EVENTS = ["story.created", "story.updated", "story.assigned", "sprint.completed"];

/** Slack OAuth install + channel config (GIN-23a) — offline-dev handlers so the
 * settings page works with no backend, mirroring the GitHub OAuth mock flow. */
export function makeSlackHandlers(): Handler[] {
  return [
    {
      method: "GET",
      pattern: /^\/workspaces\/([^/]+)\/slack\/$/,
      resolve: ([, slug]) => clone(slackStatus(slug)),
    },
    {
      method: "GET",
      pattern: /^\/workspaces\/([^/]+)\/slack\/install-url\/$/,
      resolve: ([, slug]) => ({
        url: `https://slack.com/oauth/v2/authorize?mock=1&ws=${slug}`,
      }),
    },
    {
      method: "POST",
      pattern: /^\/workspaces\/([^/]+)\/slack\/oauth\/callback\/$/,
      resolve: ([, slug]) => {
        let conn = slackConnections.find((c) => c.workspace_slug === slug);
        if (!conn) {
          conn = {
            workspace_slug: slug,
            team_name: "Acme (mock)",
            default_channel_id: null,
            default_channel_name: null,
            notify_events: [...WEBHOOK_EVENTS],
          };
          slackConnections.push(conn);
        }
        return clone(slackStatus(slug));
      },
    },
    {
      method: "GET",
      pattern: /^\/workspaces\/([^/]+)\/slack\/channels\/$/,
      resolve: ([, slug]) => {
        const conn = slackConnections.find((c) => c.workspace_slug === slug);
        if (!conn) throw new APIError(409, "Connect Slack first");
        return clone(MOCK_SLACK_CHANNELS);
      },
    },
    {
      method: "PATCH",
      pattern: /^\/workspaces\/([^/]+)\/slack\/$/,
      resolve: ([, slug], body) => {
        const conn = slackConnections.find((c) => c.workspace_slug === slug);
        if (!conn) throw new APIError(409, "Connect Slack first");
        const b = body as {
          default_channel_id?: string;
          default_channel_name?: string;
          notify_events?: string[];
        };
        if (b.default_channel_id !== undefined) {
          conn.default_channel_id = b.default_channel_id;
          conn.default_channel_name = b.default_channel_name ?? null;
        }
        if (b.notify_events !== undefined) conn.notify_events = b.notify_events;
        return clone(slackStatus(slug));
      },
    },
    {
      method: "POST",
      pattern: /^\/workspaces\/([^/]+)\/slack\/disconnect\/$/,
      resolve: ([, slug]) => {
        const i = slackConnections.findIndex((c) => c.workspace_slug === slug);
        if (i !== -1) slackConnections.splice(i, 1);
        return { success: true };
      },
    },
  ];
}
