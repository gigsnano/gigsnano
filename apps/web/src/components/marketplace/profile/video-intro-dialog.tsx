"use client";

import { useState } from "react";

import { useAdjustedState } from "@/hooks/ui/use-adjusted-state";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useMarketplaceProfileStore } from "@/store/ui/marketplace-profile.store";

const isUrl = (v: string) => {
  try {
    new URL(v);
    return true;
  } catch {
    return false;
  }
};

function VideoIntroForm({
  current,
  onOpenChange,
}: {
  current: string;
  onOpenChange: (open: boolean) => void;
}) {
  const updateProfile = useMarketplaceProfileStore((s) => s.updateProfile);
  const [url, setUrl] = useAdjustedState(current);
  const valid = url.trim() === "" || isUrl(url.trim());

  const save = () => {
    updateProfile({ video_intro_url: url.trim() });
    onOpenChange(false);
  };
  const remove = () => {
    updateProfile({ video_intro_url: "" });
    onOpenChange(false);
  };

  return (
    <>
      <DialogTitle className="text-lg font-semibold">Video introduction</DialogTitle>
      <DialogDescription className="mt-1 text-sm text-muted-foreground">
        Paste a link to a short intro video (YouTube, Vimeo, Loom).
      </DialogDescription>
      <Label id="video-intro-url-label" htmlFor="video-intro-url" className="mt-4 text-sm font-medium">
        Video URL
      </Label>
      <input
        id="video-intro-url"
        aria-labelledby="video-intro-url-label"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://youtube.com/watch?v=..."
        aria-invalid={!valid}
        className="mt-1.5 h-9 w-full rounded-md border bg-background px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-[invalid=true]:border-destructive"
      />
      {!valid && (
        <p className="mt-1 animate-in text-xs text-destructive fade-in duration-150" role="alert">
          Enter a valid URL.
        </p>
      )}
      <div className="mt-5 flex justify-between">
        <Button variant="ghost" onClick={remove} disabled={!current}>
          Remove
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!valid}>
            Save
          </Button>
        </div>
      </div>
    </>
  );
}

/**
 * URL-input dialog for the sidebar "Video introduction" entry. Save writes
 * `video_intro_url`; Remove clears it.
 */
export function VideoIntroDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const current = useMarketplaceProfileStore((s) => s.video_intro_url);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open ? <VideoIntroForm current={current} onOpenChange={onOpenChange} /> : null}
      </DialogContent>
    </Dialog>
  );
}
