"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useDisconnectGitHub,
  useGitHubInstallUrl,
  useGitHubStatus,
} from "@/hooks/auth/use-auth";
import {
  useDisconnectSlack,
  useSlackInstallUrl,
  useSlackStatus,
  useUpdateSlackConfig,
} from "@/hooks/slack/use-slack";

import { ChannelPicker } from "./slack/channel-picker";

const SLACK_EVENTS = [
  { value: "story.created", label: "Story created" },
  { value: "story.updated", label: "Story updated" },
  { value: "story.assigned", label: "Story assigned" },
  { value: "sprint.completed", label: "Sprint completed" },
];

function SlackRow({ workspaceSlug }: { workspaceSlug: string }) {
  const { data, isPending } = useSlackStatus(workspaceSlug);
  const installUrl = useSlackInstallUrl();
  const disconnect = useDisconnectSlack(workspaceSlug);
  const updateConfig = useUpdateSlackConfig(workspaceSlug);
  const [expanded, setExpanded] = useState(false);

  const onConnect = async () => {
    const res = await installUrl.mutateAsync(workspaceSlug);
    // The OAuth callback page has no workspace in its URL, so leave a crumb it
    // reads back (matches the GitHub connect flow above).
    sessionStorage.setItem("slack_oauth_ws", workspaceSlug);
    sessionStorage.setItem("slack_oauth_return", `/${workspaceSlug}/settings/integrations`);
    window.location.href = res.url;
  };

  if (isPending) {
    return (
      <li className="px-4 py-3">
        <Skeleton className="h-4 w-28" />
      </li>
    );
  }

  const connected = data?.connected ?? false;
  const busy = installUrl.isPending || disconnect.isPending;
  const notifyEvents = data?.notify_events ?? [];

  return (
    <li className="flex flex-col gap-3 px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium">Slack</p>
          <p className="text-xs text-muted-foreground">
            {connected
              ? `Connected — ${data?.team_name}${data?.default_channel_name ? ` · #${data.default_channel_name}` : ""}`
              : "Post story + sprint notifications to a channel."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {connected ? (
            <Button size="sm" variant="ghost" onClick={() => setExpanded((v) => !v)}>
              {expanded ? "Hide" : "Configure"}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant={connected ? "secondary" : "default"}
            className="active:scale-[0.97]"
            disabled={busy}
            onClick={connected ? () => disconnect.mutate() : onConnect}
          >
            {connected ? "Disconnect" : "Connect"}
          </Button>
        </div>
      </div>
      {connected && expanded ? (
        <div className="flex flex-col gap-4 rounded-lg border bg-muted/20 p-3">
          <ChannelPicker
            workspaceSlug={workspaceSlug}
            value={null}
            onChange={(channel) =>
              updateConfig.mutate({
                default_channel_id: channel.id,
                default_channel_name: channel.name,
              })
            }
          />
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Notify on</span>
            {SLACK_EVENTS.map((event) => (
              <label key={event.value} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={notifyEvents.includes(event.value)}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...notifyEvents, event.value]
                      : notifyEvents.filter((v) => v !== event.value);
                    updateConfig.mutate({ notify_events: next });
                  }}
                />
                {event.label}
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </li>
  );
}

export function IntegrationsSettings({ workspaceSlug }: { workspaceSlug: string }) {
  const { data, isPending, isError, refetch } = useGitHubStatus(workspaceSlug);
  const installUrl = useGitHubInstallUrl();
  const disconnect = useDisconnectGitHub(workspaceSlug);

  const onConnect = async () => {
    const res = await installUrl.mutateAsync(workspaceSlug);
    // The OAuth callback page has no workspace in its URL, so leave a crumb it
    // reads back (matches repo-picker.tsx). Without this the callback fails with
    // "Missing authorization details."
    sessionStorage.setItem("gh_oauth_ws", workspaceSlug);
    sessionStorage.setItem("gh_oauth_return", `/${workspaceSlug}/settings/integrations`);
    window.location.href = res.url;
  };

  if (isPending) {
    return (
      <div className="max-w-2xl px-10 py-8">
        <Skeleton className="h-6 w-36" />
        <Skeleton className="mt-2 h-4 w-64" />
        <ul className="mt-6 divide-y rounded-lg border">
          <li className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-48" />
            </div>
            <Skeleton className="h-8 w-24" />
          </li>
        </ul>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-8">
        <EmptyState
          assetKey="error"
          title="Couldn't load integrations"
          description="Something went wrong."
          actions={[{ label: "Retry", onClick: () => refetch() }]}
        />
      </div>
    );
  }

  const connected = data?.connected ?? false;
  const busy = installUrl.isPending || disconnect.isPending;

  return (
    <div className="max-w-2xl px-10 py-8">
      <h1 className="text-lg font-semibold">Integrations</h1>
      <p className="mt-1 text-sm text-muted-foreground">Connect external tools to your workspace.</p>
      <ul className="mt-6 divide-y rounded-lg border">
        <li className="flex items-center justify-between gap-4 px-4 py-3">
          <div>
            <p className="text-sm font-medium">GitHub</p>
            <p className="text-xs text-muted-foreground">
              {connected && data?.repo_url
                ? `Connected — ${data.repo_url}`
                : "Sync planning docs to a repository."}
            </p>
          </div>
          <Button
            size="sm"
            variant={connected ? "secondary" : "default"}
            className="active:scale-[0.97]"
            disabled={busy}
            onClick={connected ? () => disconnect.mutate() : onConnect}
          >
            {connected ? "Disconnect" : "Connect"}
          </Button>
        </li>
        <SlackRow workspaceSlug={workspaceSlug} />
      </ul>
    </div>
  );
}
