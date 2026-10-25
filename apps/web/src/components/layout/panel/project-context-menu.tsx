"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  MoreVerticalIcon,
  StarIcon,
  Share01Icon,
  Link01Icon,
  Tick02Icon,
  Archive01Icon,
  Settings01Icon,
} from "@hugeicons/core-free-icons";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { IProject } from "@/types";
import { useSidebarNav } from "@/store/ui/sidebar-nav.store";

/** The ⋯ menu for a project row: favorite / publish / copy link / archives / settings. */
export function ProjectContextMenu({
  workspaceSlug,
  project,
}: {
  workspaceSlug: string;
  project: IProject;
}) {
  const router = useRouter();
  const favorites = useSidebarNav((s) => s.favorites);
  const toggleFavorite = useSidebarNav((s) => s.toggleFavorite);
  const isFavorite = favorites.includes(project.id);

  // Inline feedback (no toast infra): the item label swaps briefly on action.
  // A single ref-held timer is reset on each flash and cleared on unmount, so
  // rapid double-actions don't cut a later flash short or fire after teardown.
  const [note, setNote] = useState<"copied" | "published" | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flash = (kind: "copied" | "published") => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setNote(kind);
    timerRef.current = setTimeout(() => setNote(null), 1500);
  };
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const base = `/${workspaceSlug}/projects/${project.id}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${base}`);
      flash("copied");
    } catch {
      /* clipboard blocked — no-op */
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Options for ${project.name}`}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            // Always rendered and always reachable — never hover-gated. A trigger
            // that only exists on hover is unusable on touch and invisible to
            // anyone scanning the rail; it resolves to full strength on
            // hover/focus/open rather than appearing from nothing.
            "flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none",
            "opacity-70 transition-[opacity,background-color,color,transform] duration-150 ease-out",
            "hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:opacity-100 focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-95",
            "group-hover/row:opacity-100 data-[state=open]:opacity-100",
            "motion-reduce:transition-none",
          )}
        >
          <HugeiconsIcon icon={MoreVerticalIcon} className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-48">
        <DropdownMenuItem onSelect={() => toggleFavorite(project.id)}>
          <HugeiconsIcon icon={StarIcon} className="size-4" />
          {isFavorite ? "Remove from favorites" : "Add to favorites"}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            flash("published");
          }}
        >
          <HugeiconsIcon icon={note === "published" ? Tick02Icon : Share01Icon} className="size-4" />
          {note === "published" ? "Coming soon" : "Publish project"}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            void copyLink();
          }}
        >
          <HugeiconsIcon icon={note === "copied" ? Tick02Icon : Link01Icon} className="size-4" />
          {note === "copied" ? "Copied!" : "Copy link"}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push(`${base}/archives`)}>
          <HugeiconsIcon icon={Archive01Icon} className="size-4" />
          Archives
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => router.push(`/${workspaceSlug}/settings/projects/${project.id}`)}
        >
          <HugeiconsIcon icon={Settings01Icon} className="size-4" />
          Settings
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
