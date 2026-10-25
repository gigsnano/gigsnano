"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { imageService } from "@/services/image.service";
import {
  PROJECT_COVER_GALLERY,
  PROJECT_EMOJI_PALETTE,
} from "@/constants/project-gallery";

/**
 * Popover to change a project's cover image, emoji badge, and — when
 * `onUploadLogo` is wired — an uploaded logo image (GIN-44). `trigger` is the
 * clickable element (e.g. the Change cover button or the logo glyph).
 */
export function CoverPicker({
  trigger,
  currentCover,
  currentEmoji,
  currentLogoImage,
  onSelectCover,
  onSelectEmoji,
  onUploadLogo,
  onRemoveLogo,
  workspaceSlug,
  projectId,
  align = "end",
}: {
  trigger: ReactNode;
  currentCover?: string;
  currentEmoji?: string | null;
  currentLogoImage?: string | null;
  onSelectCover: (url: string) => void;
  onSelectEmoji: (emoji: string) => void;
  /** When provided (with `workspaceSlug`), shows a "Logo image" upload section. */
  onUploadLogo?: (url: string) => void;
  onRemoveLogo?: () => void;
  workspaceSlug?: string;
  projectId?: string;
  align?: "start" | "center" | "end";
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = (file: File | undefined) => {
    if (!file || !onUploadLogo || !workspaceSlug) return;
    setError(null);
    setUploading(true);
    imageService
      .uploadImage(workspaceSlug, file, projectId)
      .then((url) => onUploadLogo(url))
      .catch(() => setError("Upload failed. Try a PNG/JPG under 10 MB."))
      .finally(() => setUploading(false));
  };

  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align={align} className="w-80">
        <div className="mb-2 text-xs font-medium text-muted-foreground">Cover image</div>
        <div className="grid grid-cols-4 gap-1.5">
          {PROJECT_COVER_GALLERY.map((cover) => (
            <button
              key={cover.id}
              type="button"
              aria-label={cover.alt}
              onClick={() => onSelectCover(cover.url)}
              className={cn(
                "relative aspect-[3/2] overflow-hidden rounded-md ring-offset-1 ring-offset-card transition-all hover:opacity-90",
                currentCover === cover.url ? "ring-2 ring-primary" : "ring-1 ring-border",
              )}
            >
              <Image
                src={cover.url}
                alt=""
                fill
                sizes="120px"
                className="object-cover"
              />
            </button>
          ))}
        </div>

        <div className="mb-2 mt-4 text-xs font-medium text-muted-foreground">Emoji</div>
        <div className="grid grid-cols-6 gap-1">
          {PROJECT_EMOJI_PALETTE.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => onSelectEmoji(emoji)}
              className={cn(
                "flex aspect-square items-center justify-center rounded-md text-lg transition-colors hover:bg-accent",
                currentEmoji === emoji && !currentLogoImage ? "bg-accent ring-1 ring-primary" : "",
              )}
            >
              {emoji}
            </button>
          ))}
        </div>

        {onUploadLogo ? (
          <>
            <div className="mb-2 mt-4 text-xs font-medium text-muted-foreground">
              Logo image
            </div>
            <div className="flex items-center gap-2">
              {currentLogoImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={currentLogoImage}
                  alt=""
                  className="size-9 shrink-0 rounded-md border object-cover"
                />
              ) : null}
              <label
                className={cn(
                  "inline-flex cursor-pointer items-center rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent active:scale-[0.98]",
                  uploading && "pointer-events-none opacity-60",
                )}
              >
                {uploading ? "Uploading…" : currentLogoImage ? "Replace" : "Upload image"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                  className="sr-only"
                  disabled={uploading}
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
              </label>
              {currentLogoImage && onRemoveLogo ? (
                <button
                  type="button"
                  onClick={onRemoveLogo}
                  className="text-xs font-medium text-muted-foreground transition-colors hover:text-destructive"
                >
                  Remove
                </button>
              ) : null}
            </div>
            {error ? <p className="mt-1.5 text-xs text-destructive">{error}</p> : null}
          </>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
