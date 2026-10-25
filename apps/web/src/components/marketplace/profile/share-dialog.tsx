"use client";

import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Copy01Icon, Tick02Icon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

/** How long the "Copied!" state holds before reverting to "Copy". */
const COPIED_HOLD_MS = 1500;

/**
 * Public-profile share link + copy-to-clipboard. The link is a static
 * `/marketplace/profile/preview` route — there is no backend for the
 * marketplace domain yet, so nothing is generated or persisted here.
 */
export function ShareDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  const link =
    typeof window !== "undefined"
      ? `${window.location.origin}/marketplace/profile/preview`
      : "/marketplace/profile/preview";

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    };
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => {
        setCopied(false);
        timeoutRef.current = null;
      }, COPIED_HOLD_MS);
    } catch {
      /* ignore — clipboard access can be denied by the browser */
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle className="text-lg font-semibold">Share your profile</DialogTitle>
        <DialogDescription className="mt-1 text-sm text-muted-foreground">
          Anyone with this link sees your public profile preview.
        </DialogDescription>
        <div className="mt-4 flex items-center gap-2">
          <input
            readOnly
            value={link}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Public profile link"
            className="h-9 min-w-0 flex-1 rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground outline-none"
          />
          {/* transitions.dev #09 icon swap — reused for the whole button
              content (icon + label) so "Copy" and "Copied!" cross-fade as
              one unit instead of jumping. */}
          <Button onClick={copy} className="t-icon-swap shrink-0" data-state={copied ? "b" : "a"}>
            <span className="t-icon inline-flex items-center gap-1.5" data-icon="a">
              <HugeiconsIcon icon={Copy01Icon} className="size-4" />
              Copy
            </span>
            <span className="t-icon inline-flex items-center gap-1.5" data-icon="b">
              <HugeiconsIcon icon={Tick02Icon} className="size-4" />
              Copied!
            </span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
