"use client";

import { useState } from "react";
import Image from "next/image";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import type { IPortfolioProject } from "@/store/ui/marketplace-profile.store";
import { useMarketplaceProfileStore } from "@/store/ui/marketplace-profile.store";

const field =
  "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-[invalid=true]:border-destructive";

const isUrl = (v: string) => {
  try {
    new URL(v);
    return true;
  } catch {
    return false;
  }
};

function PortfolioDialogBody({
  project,
  onOpenChange,
}: {
  project: IPortfolioProject | null;
  onOpenChange: (open: boolean) => void;
}) {
  const upsert = useMarketplaceProfileStore((s) => s.upsertPortfolioProject);
  const remove = useMarketplaceProfileStore((s) => s.removePortfolioProject);
  const [title, setTitle] = useState(project?.title ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [imageUrl, setImageUrl] = useState(project?.image_url ?? "");
  const [published, setPublished] = useState(project?.published ?? true);
  const [imageBroken, setImageBroken] = useState(false);

  const trimmedImageUrl = imageUrl.trim();
  const imageUrlValid = trimmedImageUrl === "" || isUrl(trimmedImageUrl);

  const save = () => {
    if (!title.trim()) return;
    upsert({
      id: project?.id ?? crypto.randomUUID(),
      title: title.trim(),
      description: description.trim(),
      image_url: imageUrl.trim(),
      skills: project?.skills ?? [],
      published,
    });
    onOpenChange(false);
  };

  return (
    <>
      <DialogTitle className="text-lg font-semibold">
        {project ? "Edit project" : "Add a project"}
      </DialogTitle>
      <DialogDescription className="mt-1 text-sm text-muted-foreground">
        Showcase work you&apos;re proud of.
      </DialogDescription>

      <div className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium">
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={field}
            placeholder="Project title"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium">
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className={cn(field, "h-auto resize-y py-2 leading-relaxed")}
            placeholder="What did you build?"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium">
          Image URL (optional)
          <input
            value={imageUrl}
            onChange={(e) => {
              setImageUrl(e.target.value);
              setImageBroken(false);
            }}
            aria-invalid={!imageUrlValid}
            className={field}
            placeholder="https://…"
          />
        </label>
        {!imageUrlValid ? (
          <p className="-mt-1.5 animate-in text-xs text-destructive fade-in duration-150" role="alert">
            Enter a valid URL, or leave blank.
          </p>
        ) : trimmedImageUrl ? (
          <div className="relative -mt-1 aspect-video w-full overflow-hidden rounded-md border bg-muted">
            {!imageBroken ? (
              <Image
                key={trimmedImageUrl}
                src={trimmedImageUrl}
                alt={title.trim() ? `Preview of ${title.trim()}` : "Portfolio project preview"}
                aria-label={title.trim() ? `Preview of ${title.trim()}` : "Portfolio project preview"}
                fill
                unoptimized
                sizes="(max-width: 768px) 100vw, 480px"
                className="animate-in object-cover fade-in duration-200"
                onError={() => setImageBroken(true)}
              />
            ) : (
              <p className="flex size-full items-center justify-center text-xs text-muted-foreground">
                Image couldn&apos;t load
              </p>
            )}
          </div>
        ) : null}

        <div className="mt-1 flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
          <div>
            <p className="text-sm font-medium">Published</p>
            <p className="text-xs text-muted-foreground">Visible on your public profile</p>
          </div>
          <Switch
            checked={published}
            onCheckedChange={setPublished}
            aria-label="Published"
          />
        </div>
      </div>

      <div className="mt-5 flex justify-between">
        {project ? (
          <Button
            variant="destructive"
            onClick={() => {
              remove(project.id);
              onOpenChange(false);
            }}
          >
            Delete
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!title.trim()}>
            Save
          </Button>
        </div>
      </div>
    </>
  );
}

/**
 * Create/edit dialog for a portfolio project. `project === null` is create
 * mode (new id minted on save); otherwise edits in place and offers Delete.
 * The inner form remounts via `key` whenever the dialog opens for a different
 * project so draft fields never leak between create/edit sessions.
 */
export function PortfolioDialog({
  open,
  onOpenChange,
  project,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: IPortfolioProject | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        {open ? (
          <PortfolioDialogBody
            key={project?.id ?? "new"}
            project={project}
            onOpenChange={onOpenChange}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
