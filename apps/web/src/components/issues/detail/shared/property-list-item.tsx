import { type ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";

import { cn } from "@/lib/utils";

type IconDef = typeof import("@hugeicons/core-free-icons").Add01Icon;

/** Plane SidebarPropertyListItem — icon + label column, control column. */
export function IssuePropertyListItem({
  icon,
  label,
  children,
  className,
}: {
  icon: IconDef;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start gap-2 py-1.5", className)}>
      <div className="flex h-8 w-[7.5rem] shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
        <HugeiconsIcon icon={icon} className="size-3.5 shrink-0" />
        <span>{label}</span>
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
