import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/** Base skeleton block — a pulsing muted placeholder. Compose these to mirror
 * the exact shape of the content that's loading. */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />;
}
