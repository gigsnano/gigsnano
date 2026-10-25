"use client";

import { useRef, type CSSProperties } from "react";

import { cn } from "@/lib/utils";
import type { IMemberPreview } from "@/types";
import { humanAvatar, type TAssigneeAvatar } from "@/lib/issues/assignee-avatars";

import { Avatar } from "./avatar";
import { AgentAvatar } from "./agent-avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";

const RING = "ring-2 ring-card";

const CHIP_SIZE: Record<"xs" | "sm" | "md", string> = {
  xs: "size-6 text-[10px]",
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
};

function tooltipLabel(item: TAssigneeAvatar) {
  return item.kind === "agent" ? `${item.display_name} — AI agent` : item.display_name;
}

export function AvatarGroup({
  members,
  items,
  total,
  max = 4,
  size = "sm",
  className,
}: {
  /** Legacy human-only API (project card/list/table, overview, members-control). */
  members?: IMemberPreview[];
  /** Mixed human+agent API. Takes precedence over `members` when provided. */
  items?: TAssigneeAvatar[];
  /** Total count driving the +N overflow; defaults to the rendered list length. */
  total?: number;
  max?: number;
  size?: "xs" | "sm" | "md";
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  const list: TAssigneeAvatar[] = items ?? (members ?? []).map(humanAvatar);
  const count = total ?? list.length;
  const shown = list.slice(0, max);
  const overflow = count - shown.length;

  // Distance-falloff "comb" lift (transitions.dev #11). Timing-function is set
  // inline BEFORE the variable writes so we get a clean ease-in on the way up
  // and a bouncy spring on the return, from one transform transition.
  const setShifts = (activeIdx: number | null, phase: "in" | "out") => {
    const root = rootRef.current;
    if (!root) return;
    const cs = getComputedStyle(document.documentElement);
    const num = (name: string, fb: number) => {
      const v = parseFloat(cs.getPropertyValue(name));
      return Number.isFinite(v) ? v : fb;
    };
    const ease = (name: string, fb: string) => cs.getPropertyValue(name).trim() || fb;

    const lift = num("--avatar-lift", -4);
    const falloff = num("--avatar-falloff", 0.45);
    const scale = num("--avatar-scale", 1.08);
    const tf =
      phase === "out"
        ? ease("--avatar-ease-out", "cubic-bezier(0.34, 3.85, 0.64, 1)")
        : ease("--avatar-ease-in", "cubic-bezier(0.22, 1, 0.36, 1)");

    root.querySelectorAll<HTMLElement>(".t-avatar").forEach((el, i) => {
      el.style.transitionTimingFunction = tf;
      if (activeIdx == null) {
        el.style.setProperty("--shift", "0px");
        el.style.setProperty("--scale-active", "1");
        return;
      }
      const d = Math.abs(i - activeIdx);
      el.style.setProperty("--shift", (lift * Math.pow(falloff, d)).toFixed(3) + "px");
      el.style.setProperty("--scale-active", i === activeIdx ? String(scale) : "1");
    });
  };

  if (count === 0) {
    return <span className={cn("text-xs text-muted-foreground", className)}>No members</span>;
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div
        ref={rootRef}
        className={cn("flex items-center -space-x-2", className)}
        onMouseLeave={() => setShifts(null, "out")}
      >
        {shown.map((item, index) => (
          <span key={item.id} className="t-avatar-reveal" style={{ "--i": index } as CSSProperties}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="t-avatar block" onMouseEnter={() => setShifts(index, "in")}>
                  {item.kind === "agent" ? (
                    <AgentAvatar
                      role={item.role}
                      persona={item.persona}
                      display_name={item.display_name}
                      size={size}
                      className={RING}
                    />
                  ) : (
                    <Avatar
                      name={item.display_name}
                      src={item.avatar_url}
                      size={size}
                      className={RING}
                    />
                  )}
                </span>
              </TooltipTrigger>
              <TooltipContent>{tooltipLabel(item)}</TooltipContent>
            </Tooltip>
          </span>
        ))}
        {overflow > 0 ? (
          <span className="t-avatar-reveal" style={{ "--i": shown.length } as CSSProperties}>
            <span
              className={cn(
                "t-avatar flex shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground",
                CHIP_SIZE[size],
                RING,
              )}
              onMouseEnter={() => setShifts(shown.length, "in")}
            >
              +{overflow}
            </span>
          </span>
        ) : null}
      </div>
    </TooltipProvider>
  );
}
