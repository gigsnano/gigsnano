"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link01Icon, Copy01Icon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCreateIntakeLink } from "@/hooks/intake/use-intake";

/** Mints (once opened) and shows a shareable public-intake link with copy. */
export function ShareFormButton({ workspaceSlug }: { workspaceSlug: string }) {
  const mint = useCreateIntakeLink(workspaceSlug);
  const [copied, setCopied] = useState(false);

  const fullUrl =
    mint.data && typeof window !== "undefined"
      ? new URL(mint.data.url, window.location.origin).toString()
      : (mint.data?.url ?? "");

  const copy = () => {
    if (!fullUrl) return;
    void navigator.clipboard.writeText(fullUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <Popover
      onOpenChange={(open) => {
        if (open && !mint.data && !mint.isPending) mint.mutate();
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <HugeiconsIcon icon={Link01Icon} className="size-4" />
          Share form
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <p className="text-sm font-medium">Public intake link</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Anyone with this link can submit a request — no account needed.
        </p>
        <div className="mt-3 flex items-center gap-1.5">
          <Input
            readOnly
            value={mint.isPending ? "Generating…" : fullUrl}
            aria-label="Public intake link"
            className="text-xs"
            onFocus={(e) => e.currentTarget.select()}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={copy}
            disabled={!fullUrl}
            aria-label="Copy link"
          >
            <HugeiconsIcon
              icon={copied ? CheckmarkCircle02Icon : Copy01Icon}
              className="size-4"
            />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
