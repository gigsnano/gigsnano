"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon } from "@hugeicons/core-free-icons";

import { AppHeader, ContentWrapper } from "@/components/layout";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useCaptureTriage, useTriageQueue } from "@/hooks/intake/use-intake";
import { ETriageSource } from "@/types";

import { TriageCard } from "./triage-card";
import { ShareFormButton } from "./share-form-button";

export function IntakeQueue({ workspaceSlug }: { workspaceSlug: string }) {
  const { data, isPending, isError, refetch } = useTriageQueue(workspaceSlug);
  const capture = useCaptureTriage(workspaceSlug);
  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const items = data ?? [];
  const hasItems = !isPending && !isError && items.length > 0;

  const submit = () => {
    if (!title.trim()) return;
    capture.mutate(
      { title: title.trim(), body: body.trim(), source: ETriageSource.Personal },
      {
        onSuccess: () => {
          setTitle("");
          setBody("");
          setComposing(false);
        },
      },
    );
  };

  return (
    <>
      <AppHeader
        actions={
          <div className="flex items-center gap-2">
            <ShareFormButton workspaceSlug={workspaceSlug} />
            <Button size="sm" onClick={() => setComposing((v) => !v)}>
              <HugeiconsIcon icon={Add01Icon} className="size-4" />
              New request
            </Button>
          </div>
        }
      />
      <ContentWrapper className="p-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
          {composing ? (
            <div className="rounded-xl border bg-card p-4">
              <Input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What's the request?"
                aria-label="Request title"
              />
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Any detail the Analyst should know…"
                aria-label="Request detail"
                rows={3}
                className="mt-2 w-full resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
              <div className="mt-2 flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setComposing(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={submit} disabled={!title.trim() || capture.isPending}>
                  {capture.isPending ? "Adding…" : "Add to queue"}
                </Button>
              </div>
            </div>
          ) : null}

          {isPending ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-40 rounded-xl" />
              ))}
            </div>
          ) : isError ? (
            <EmptyState
              assetKey="error"
              title="Couldn't load the triage queue"
              description="Something went wrong fetching inbound requests."
              actions={[{ label: "Retry", onClick: () => refetch() }]}
            />
          ) : items.length === 0 ? (
            <EmptyState
              assetKey="generic"
              title="Triage queue is clear"
              description="Inbound requests — from your team, customers, or a public form — land here for the Analyst to classify and route."
              actions={[{ label: "New request", onClick: () => setComposing(true) }]}
            />
          ) : (
            hasItems &&
            items.map((item, i) => (
              <TriageCard key={item.id} item={item} workspaceSlug={workspaceSlug} index={i} />
            ))
          )}
        </div>
      </ContentWrapper>
    </>
  );
}
