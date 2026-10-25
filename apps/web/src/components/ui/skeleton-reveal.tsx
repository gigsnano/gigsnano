"use client";

import { type ReactNode } from "react";

import { cn } from "@/lib/utils";

/** transitions.dev #14 — skeleton pulse then cross-blur reveal. */
export function SkeletonReveal({
  isLoading,
  skeleton,
  children,
  className,
}: {
  isLoading: boolean;
  skeleton: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("t-skel", !isLoading && "is-revealed", className)}>
      <div className="t-skel-skeleton is-pulsing">{skeleton}</div>
      <div className="t-skel-content">{children}</div>
    </div>
  );
}
