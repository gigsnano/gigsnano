"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Image01Icon } from "@hugeicons/core-free-icons";

import { ProjectCoverImage } from "@/components/projects/project-cover-image";
import { Button } from "@/components/ui/button";
import type { IProject, IUpdateProjectPayload } from "@/types";
import { CoverPicker } from "./cover-picker";

/**
 * Sleek project hero: full-bleed cover with a hover "Change cover" control and a
 * floating emoji glyph (Notion page-icon style) overlapping the bottom edge.
 * Both open the shared cover/emoji picker; changes are pushed up via `onChange`.
 */
export function ProjectHero({
  project,
  onChange,
}: {
  project: IProject;
  onChange: (payload: IUpdateProjectPayload) => void;
}) {
  // Shared cover/emoji/logo picker wiring. Picking an emoji clears the uploaded
  // logo image so the emoji is visible (image takes precedence in ProjectLogo).
  const logoPickerProps = {
    currentCover: project.cover_image_url,
    currentEmoji: project.logo_emoji,
    currentLogoImage: project.logo_image_url,
    workspaceSlug: project.workspace_slug,
    projectId: project.id,
    onSelectCover: (url: string) => onChange({ cover_image_url: url }),
    onSelectEmoji: (emoji: string) => onChange({ logo_emoji: emoji, logo_image_url: null }),
    onUploadLogo: (url: string) => onChange({ logo_image_url: url }),
    onRemoveLogo: () => onChange({ logo_image_url: null }),
  };

  return (
    <div className="group/hero relative">
      <div className="relative h-40 w-full overflow-hidden rounded-xl bg-muted sm:h-48">
        <ProjectCoverImage
          src={project.cover_image_url}
          fill
          sizes="(max-width: 640px) 100vw, 768px"
          className="object-cover"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />

        <div className="absolute right-3 top-3 opacity-0 transition-opacity duration-150 group-hover/hero:opacity-100">
          <CoverPicker
            {...logoPickerProps}
            trigger={
              <Button size="sm" variant="secondary" className="shadow-sm">
                <HugeiconsIcon icon={Image01Icon} className="size-4" />
                Change cover
              </Button>
            }
          />
        </div>
      </div>

      {/* Floating logo, overlapping the cover bottom edge. Uploaded image wins over emoji. */}
      <div className="absolute -bottom-5 left-5">
        <CoverPicker
          {...logoPickerProps}
          align="start"
          trigger={
            <button
              type="button"
              aria-label="Change project logo"
              className="flex size-14 items-center justify-center overflow-hidden rounded-xl border bg-card text-3xl shadow-sm transition-transform hover:scale-105 active:scale-95"
            >
              {project.logo_image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={project.logo_image_url} alt="" className="size-full object-cover" />
              ) : (
                <span aria-hidden>{project.logo_emoji ?? "📁"}</span>
              )}
            </button>
          }
        />
      </div>
    </div>
  );
}
