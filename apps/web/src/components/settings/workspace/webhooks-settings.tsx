"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  useCreateWebhook,
  useDeleteWebhook,
  useWebhooks,
} from "@/hooks/integrations/use-webhooks";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

const field =
  "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function WebhooksSettings({ workspaceSlug }: { workspaceSlug: string }) {
  const router = useRouter();
  const { data, isPending, isError, refetch } = useWebhooks(workspaceSlug);
  const create = useCreateWebhook(workspaceSlug);
  const remove = useDeleteWebhook(workspaceSlug);
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("https://hooks.example.com/new");
  const [events, setEvents] = useState("story.created, story.updated");

  const onAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const created = await create.mutateAsync({
      url: url.trim(),
      events: events.split(",").flatMap((s) => {
        const trimmed = s.trim();
        return trimmed ? [trimmed] : [];
      }),
    });
    setOpen(false);
    router.push(`/${workspaceSlug}/settings/webhooks/${created.id}`);
  };

  if (isPending) {
    return (
      <div className="max-w-2xl px-10 py-8">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-8 w-28" />
        </div>
        <ul className="mt-6 divide-y rounded-lg border">
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Skeleton className="h-3.5 w-56" />
                <Skeleton className="h-3 w-40" />
              </div>
              <Skeleton className="h-8 w-16 shrink-0" />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-8">
        <EmptyState
          assetKey="error"
          title="Couldn't load webhooks"
          description="Something went wrong."
          actions={[{ label: "Retry", onClick: () => refetch() }]}
        />
      </div>
    );
  }

  const webhooks = data ?? [];

  return (
    <div className="max-w-2xl px-10 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Webhooks</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Receive HTTP callbacks when workspace events occur.
          </p>
        </div>
        <Button size="sm" className="active:scale-[0.97]" onClick={() => setOpen(true)}>
          Add webhook
        </Button>
      </div>

      {webhooks.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            assetKey="generic"
            title="No webhooks"
            description="Add a webhook URL to receive event payloads."
            actions={[{ label: "Add webhook", onClick: () => setOpen(true) }]}
          />
        </div>
      ) : (
        <ul className="mt-6 divide-y rounded-lg border">
          {webhooks.map((wh) => (
            <li key={wh.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <Link
                href={`/${workspaceSlug}/settings/webhooks/${wh.id}`}
                className="min-w-0 flex-1 hover:opacity-80"
              >
                <p className="truncate font-mono text-xs">{wh.url}</p>
                <p className="mt-1 text-xs text-muted-foreground">{wh.events.join(", ")}</p>
              </Link>
              <Button
                size="sm"
                variant="ghost"
                className="shrink-0 text-destructive active:scale-[0.97]"
                disabled={remove.isPending}
                onClick={() => remove.mutate(wh.id)}
              >
                Delete
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>Add webhook</DialogTitle>
          <DialogDescription>Payloads are signed with a secret shown on the detail page.</DialogDescription>
          <form onSubmit={onAdd} className="mt-4 flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label id="webhook-url-label" htmlFor="webhook-url">Endpoint URL</Label>
              <input
                id="webhook-url"
                aria-labelledby="webhook-url-label"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className={field}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label id="webhook-events-label" htmlFor="webhook-events">Events</Label>
              <input
                id="webhook-events"
                aria-labelledby="webhook-events-label"
                value={events}
                onChange={(e) => setEvents(e.target.value)}
                placeholder="Events (comma-separated)"
                className={field}
              />
            </div>
            <Button type="submit" disabled={create.isPending} className="active:scale-[0.97]">
              {create.isPending ? "Creating…" : "Create webhook"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
