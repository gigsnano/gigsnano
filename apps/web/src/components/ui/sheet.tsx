"use client";

import type { ComponentProps, ReactNode } from "react";
import { Dialog } from "radix-ui";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";

export const Sheet = Dialog.Root;
export const SheetTrigger = Dialog.Trigger;
export const SheetClose = Dialog.Close;

export function SheetContent({
  children,
  className,
  side = "right",
}: {
  children: ReactNode;
  className?: string;
  /** Edge the sheet slides in from. Left is for navigation drawers. */
  side?: "left" | "right";
}) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-backdrop data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:duration-300 data-[state=closed]:duration-200" />
      <Dialog.Content
        className={cn(
          "fixed inset-y-0 z-50 flex w-full max-w-lg flex-col bg-background shadow-xl outline-none",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          side === "right"
            ? "right-0 data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right"
            : "left-0 data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left",
          "data-[state=open]:duration-300 data-[state=closed]:duration-200 ease-out",
          className,
        )}
      >
        {children}
        <Dialog.Close className="absolute right-3 top-3.5 flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50">
          <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
          <span className="sr-only">Close</span>
        </Dialog.Close>
      </Dialog.Content>
    </Dialog.Portal>
  );
}

export function SheetTitle({ className, ...props }: ComponentProps<typeof Dialog.Title>) {
  return <Dialog.Title className={cn("text-sm font-semibold text-foreground", className)} {...props} />;
}

export function SheetDescription({ className, ...props }: ComponentProps<typeof Dialog.Description>) {
  return <Dialog.Description className={cn("text-xs text-muted-foreground", className)} {...props} />;
}
