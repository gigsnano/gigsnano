"use client";

import { useRouter } from "next/navigation";

import { ShimmerText } from "@/components/ui/shimmer-text";
import { storyAssistantHref } from "@/lib/issues/issue-routes";
import { cn } from "@/lib/utils";
import { propertyTrigger } from "@/components/issues/shared/property-trigger";
import type { IStory } from "@/types";
import { HugeiconsIcon } from "@hugeicons/react";
import { AiMagicIcon } from "@hugeicons/core-free-icons";

/**
 * Compact GigsAI pill for the detail meta row — opens assistant mode.
 */
export function GigsAiStoryButton({
  story,
  workspaceSlug,
  projectId,
  variant = "pill",
}: {
  story: IStory;
  workspaceSlug: string;
  projectId: string;
  variant?: "pill" | "banner";
}) {
  const router = useRouter();

  if (variant === "banner") return null;

  const openAssistant = () => {
    router.push(
      storyAssistantHref(workspaceSlug, projectId, story.id, {
        peek: true,
        search: new URL(window.location.href).searchParams.toString(),
      }),
      { scroll: false },
    );
  };

  return (
    <button
      type="button"
      onClick={openAssistant}
      aria-label="Work with GigsAI"
      className={cn(propertyTrigger, "text-primary hover:bg-primary/10 hover:text-primary")}
    >
      <HugeiconsIcon icon={AiMagicIcon} className="size-3.5 text-primary" />
      <ShimmerText text="GigsAI" />
    </button>
  );
}
