import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Scrollable content region below the header. The header stays fixed; only this scrolls. */
export function ContentWrapper({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("min-h-0 flex-1 overflow-y-auto", className)}>{children}</div>;
}
