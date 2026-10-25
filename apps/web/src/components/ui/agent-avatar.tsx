"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { SparklesIcon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";
import { agentAccent } from "@/constants/agent-accents";

/** Squircle (vs the human circle) so AI reads as distinct even at 20px. */
const SIZE: Record<"xs" | "sm" | "md", string> = {
  xs: "size-6 rounded-[9px] text-[10px]",
  sm: "size-8 rounded-[11px] text-xs",
  md: "size-10 rounded-[14px] text-sm",
};
const BADGE: Record<"xs" | "sm" | "md", string> = {
  xs: "size-2.5 -bottom-0.5 -right-0.5",
  sm: "size-3 -bottom-1 -right-1",
  md: "size-3.5 -bottom-1 -right-1",
};
const BADGE_ICON: Record<"xs" | "sm" | "md", string> = {
  xs: "size-1.5",
  sm: "size-2",
  md: "size-2.5",
};

function initial(persona: string, role: string) {
  return (persona || role || "?").trim().charAt(0).toUpperCase();
}

export function AgentAvatar({
  role,
  persona,
  display_name,
  size = "sm",
  className,
  pop = true,
}: {
  role: string;
  persona: string;
  display_name: string;
  size?: "xs" | "sm" | "md";
  className?: string;
  /** Play the badge mount-pop. Off for high-frequency contexts (picker rows/trigger). */
  pop?: boolean;
}) {
  return (
    <span
      role="img"
      aria-label={`${display_name} — AI agent`}
      className={cn(
        "relative inline-flex shrink-0 select-none items-center justify-center font-semibold",
        SIZE[size],
        agentAccent(role),
        className,
      )}
    >
      {initial(persona, role)}
      <span
        className={cn(
          "absolute flex items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-card",
          pop && "t-agent-badge",
          BADGE[size],
        )}
      >
        <HugeiconsIcon icon={SparklesIcon} className={BADGE_ICON[size]} />
      </span>
    </span>
  );
}
