"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  useDeleteWebhook,
  useTestWebhook,
  useUpdateWebhook,
  useWebhook,
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

export function WebhookDetail({
  workspaceSlug,
  webhookId,
}: {
  workspaceSlug: string;
  webhookId: string;
}) {
  const router = useRouter();
  const { data: wh, isPending, isError, refetch } = useWebhook(workspaceSlug, webhookId);
  const update = useUpdateWebhook(workspaceSlug, webhookId);
  const remove = useDeleteWebhook(workspaceSlug);
  const test = useTestWebhook(workspaceSlug, webhookId);
  const [editOpen, setEditOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState("");

  const openEdit = () => {
    if (!wh) return;
    setUrl(wh.url);
    setEvents(wh.events.join(", "));
    setEditOpen(true);
  };

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await update.mutateAsync({
      url: url.trim(),
      events: events.split(",").flatMap((s) => {
        const trimmed = s.trim();
        return trimmed ? [trimmed] : [];
      }),
    });
    setEditOpen(false);
  };

  const onDelete = () => {
    remove.mutate(webhookId, {
      onSuccess: () => router.push(`/${workspaceSlug}/settings/webhooks`),
    });
  };

  if (isPending) {
    return (
      <div className="max-w-2xl px-10 py-8">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-4 h-5 w-72" />
        <Skeleton className="mt-2 h-4 w-48" />
        <div className="mt-6 space-y-3 rounded-lg border p-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex justify-between gap-4">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-40" />
            </div>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-16" />
        </div>
      </div>
    );
  }

  if (isError || !wh) {
    return (
      <div className="p-8">
        <EmptyState
          assetKey="error"
          title="Webhook not found"
          description="This webhook was removed or doesn't exist."
          actions={[
            { label: "All webhooks", href: `/${workspaceSlug}/settings/webhooks` },
            { label: "Retry", onClick: () => refetch() },
          ]}
        />
      </div>
    );
  }

  return (
    <div className="max-w-2xl px-10 py-8">
      <Link
        href={`/${workspaceSlug}/settings/webhooks`}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Webhooks
      </Link>
      <h1 className="mt-4 font-mono text-sm break-all">{wh.url}</h1>
      <p className="mt-2 text-sm text-muted-foreground">Secret: {wh.secret_preview}</p>

      <dl className="mt-6 space-y-3 rounded-lg border p-4 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Events</dt>
          <dd className="text-right">{wh.events.join(", ")}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Status</dt>
          <dd>{wh.enabled ? "Enabled" : "Disabled"}</dd>
        </div>
        {wh.last_delivery ? (
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Last delivery</dt>
            <dd>
              {wh.last_delivery.status} ({wh.last_delivery.response_code}) —{" "}
              {new Date(wh.last_delivery.created_at).toLocaleString()}
            </dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-6 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="active:scale-[0.97]" onClick={openEdit}>
          Edit
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="active:scale-[0.97]"
          disabled={test.isPending}
          onClick={() => test.mutate()}
        >
          {test.isPending ? "Sending…" : "Send test"}
        </Button>
        <Button
          size="sm"
          variant="destructive"
          className="active:scale-[0.97]"
          disabled={remove.isPending}
          onClick={onDelete}
        >
          Delete
        </Button>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogTitle>Edit webhook</DialogTitle>
          <DialogDescription>Update the endpoint URL or subscribed events.</DialogDescription>
          <form onSubmit={onSave} className="mt-4 flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label id="webhook-edit-url-label" htmlFor="webhook-edit-url">Endpoint URL</Label>
              <input
                id="webhook-edit-url"
                aria-labelledby="webhook-edit-url-label"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className={field}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label id="webhook-edit-events-label" htmlFor="webhook-edit-events">Events</Label>
              <input
                id="webhook-edit-events"
                aria-labelledby="webhook-edit-events-label"
                value={events}
                onChange={(e) => setEvents(e.target.value)}
                className={field}
              />
            </div>
            <Button type="submit" disabled={update.isPending} className="active:scale-[0.97]">
              {update.isPending ? "Saving…" : "Save changes"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
