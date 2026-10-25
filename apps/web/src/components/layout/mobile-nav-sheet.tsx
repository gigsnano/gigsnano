"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { Menu01Icon } from "@hugeicons/core-free-icons";

import { BrandLogo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useMediaQuery } from "@/hooks/ui/use-media-query";
import { minWidth } from "@/lib/layout/breakpoints";
import { cn } from "@/lib/utils";

/**
 * Phone navigation for the shells that have a top nav or sidebar but no Rail
 * A/B (admin, marketplace, marketing). Renders the menu button (hidden from
 * `md`) and a left drawer with the shell's nav. The open state is keyed to the
 * pathname it was opened on, so any navigation closes it, and it can never be
 * open at `md`+ where the desktop nav is showing. Rows are `MobileNavLink`s,
 * which also close it on a tap to the current page or a hash anchor.
 */
export function MobileNavSheet({
  title,
  children,
  footer,
  className,
}: {
  /** Short label beside the logo; also the dialog's accessible name. */
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const pathname = usePathname();
  const [openAt, setOpenAt] = useState<string | null>(null);
  const wide = useMediaQuery(minWidth("md"));
  const open = openAt === pathname && !wide;

  return (
    <Sheet open={open} onOpenChange={(next) => setOpenAt(next ? pathname : null)}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Open navigation"
          className={cn("shrink-0 md:hidden", className)}
        >
          <HugeiconsIcon icon={Menu01Icon} className="size-5" />
        </Button>
      </SheetTrigger>
      {/* Same motion as the workspace navigation sheet: 220ms in, 180ms out. */}
      <SheetContent
        side="left"
        className="w-[min(18rem,calc(100vw-3rem))] max-w-none border-r bg-sidebar text-sidebar-foreground [--tw-ease:var(--ease-drawer)] data-[state=closed]:[--tw-duration:180ms] data-[state=open]:[--tw-duration:220ms]"
      >
        <div className="flex h-14 shrink-0 items-center gap-2 px-4">
          <BrandLogo className="h-5" />
          <SheetTitle className="text-xs font-medium text-muted-foreground">{title}</SheetTitle>
        </div>
        <nav aria-label={title} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
          {children}
        </nav>
        {footer ? <div className="shrink-0 border-t border-sidebar-border px-3 py-2">{footer}</div> : null}
      </SheetContent>
    </Sheet>
  );
}

/** One row in a `MobileNavSheet`: a 44px touch target that closes the sheet. */
export function MobileNavLink({
  href,
  active = false,
  children,
}: {
  href: string;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <SheetClose asChild>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-h-11 items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors duration-150 select-none",
          "hover:bg-sidebar-accent hover:text-sidebar-foreground active:bg-sidebar-accent",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
          active && "bg-sidebar-accent font-medium text-sidebar-foreground",
        )}
      >
        {children}
      </Link>
    </SheetClose>
  );
}
