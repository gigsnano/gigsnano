"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { SquareLock02Icon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface IUpgradeNudgeProps {
  title?: string;
  description?: string;
  /** Show a lock glyph beside the title (for gated-capability states). */
  locked?: boolean;
  className?: string;
}

export function UpgradeNudge({
  title = "Upgrade to unlock this",
  description = "This feature is available on a higher plan.",
  locked = false,
  className,
}: IUpgradeNudgeProps) {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  return (
    <div
      className={cn(
        "flex flex-col items-start gap-3 rounded-xl border border-border/60 bg-muted/40 p-5",
        "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300",
        className,
      )}
    >
      <div>
        <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          {locked ? (
            <HugeiconsIcon icon={SquareLock02Icon} className="size-4 text-muted-foreground" />
          ) : null}
          {title}
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      </div>
      <Button asChild size="sm">
        <Link href={`/${workspaceSlug}/settings/billing`}>View plans</Link>
      </Button>
    </div>
  );
}
