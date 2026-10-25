"use client";

import { useState } from "react";
import Link from "next/link";

import { RichEditor } from "@/components/editor";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { usePublishListing } from "@/hooks/marketplace/use-marketplace-flow";
import { marketplaceApiMessage } from "@/lib/marketplace/api-errors";

const field =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

const pressable = "transition-transform duration-100 ease-out active:scale-[0.97]";

export function PublishListingDialog({
  workspaceSlug,
  storyId,
  cycleId,
  defaultTitle,
  defaultDescription = "",
  open,
  onOpenChange,
}: {
  workspaceSlug: string;
  storyId?: string;
  cycleId?: string;
  defaultTitle: string;
  defaultDescription?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState(defaultDescription);
  const publish = usePublishListing(workspaceSlug);

  // Reset the form to the incoming defaults whenever the dialog opens (or the
  // defaults change while open). Adjusted during render via a prev-key check
  // instead of an effect, matching the old effect's trigger set without the
  // extra render.
  const resetKey = `${open} ${defaultTitle} ${defaultDescription}`;
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  if (resetKey !== prevResetKey) {
    setPrevResetKey(resetKey);
    if (open) {
      setTitle(defaultTitle);
      setDescription(defaultDescription);
    }
  }

  const onSubmit = async () => {
    try {
      await publish.mutateAsync({
        story_id: storyId ?? null,
        cycle_id: cycleId ?? null,
        title: title.trim(),
        description: description.trim(),
      });
      onOpenChange(false);
    } catch {
      /* surfaced via publish.isError */
    }
  };

  const canPublish = Boolean(title.trim()) && (Boolean(storyId) || Boolean(cycleId));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg duration-200">
        <div className="space-y-1 pr-6">
          <DialogTitle className="text-base font-semibold tracking-tight">
            Publish to marketplace
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
            Freelancers can bid on this work item. Accepting a bid holds escrow from your
            workspace wallet. For Sprint-0 steps, the hired freelancer completes the work using
            the owning BMAD agent workflow.
          </DialogDescription>
        </div>

        <div className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="listing-title">Title</Label>
            <input
              id="listing-title"
              aria-label="Title"
              value={title}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              className={field}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium text-foreground">Description</span>
              <span className="text-xs text-muted-foreground">Prefilled from the work item</span>
            </div>
            <div className="max-h-72 min-h-[168px] overflow-y-auto rounded-md border border-input bg-transparent px-3 py-2.5 shadow-xs transition-colors focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
              <RichEditor
                value={description}
                onChange={setDescription}
                placeholder="Describe the work so freelancers know what they're bidding on…"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Formatting — headings, lists, links — is preserved on the public listing.
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <Button variant="outline" className={pressable} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className={pressable}
            disabled={!canPublish || publish.isPending}
            onClick={() => void onSubmit()}
          >
            {publish.isPending ? "Publishing…" : "Publish"}
          </Button>
        </div>

        {publish.isError ? (
          <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {marketplaceApiMessage(publish.error, "Could not publish. Try again.")}
          </p>
        ) : null}
        {publish.isSuccess ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Listing live. Manage bids in{" "}
            <Link
              href={`/${workspaceSlug}/settings/hired-work`}
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              Hired work
            </Link>
            .
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
