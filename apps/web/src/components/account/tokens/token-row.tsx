"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Delete02Icon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { relativeTime } from "@/lib/format/relative-time";
import { cn } from "@/lib/utils";
import { useRevokeToken } from "@/hooks/tokens/use-tokens";
import type { IPersonalAccessToken } from "@/types";

/** Constant placeholder — a real token value is NEVER stored or rendered here. */
const MASKED_VALUE = "gnp_••••••••";

/**
 * One personal-access-token row: name, masked value, created/last-used
 * relative time, and a Revoke action guarded by a confirm. Once revoked the
 * row reads as disabled (dimmed, no actions). The staggered mount reveal comes
 * from the shared `.t-doc-row` class on the wrapping <li>.
 */
export function TokenRow({ token }: { token: IPersonalAccessToken }) {
  const revoke = useRevokeToken();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const revoked = token.revoked_at !== null;

  const handleRevoke = () => {
    revoke.mutate(token.id, { onSuccess: () => setConfirmOpen(false) });
  };

  return (
    <>
      <div
        className={cn(
          "flex items-center gap-4 px-4 py-3 transition-opacity duration-300 ease-out",
          revoked && "opacity-55",
        )}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{token.name}</span>
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
              {MASKED_VALUE}
            </code>
          </div>
          <span className="text-xs text-muted-foreground">
            {revoked ? (
              <>Revoked {relativeTime(token.revoked_at!)}</>
            ) : (
              <>
                Created {relativeTime(token.created_at)}
                {" · "}
                {token.last_used_at ? `used ${relativeTime(token.last_used_at)}` : "never used"}
              </>
            )}
          </span>
        </div>

        {revoked ? (
          <span className="shrink-0 text-xs font-medium text-muted-foreground">Revoked</span>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setConfirmOpen(true)}
            aria-label={`Revoke ${token.name}`}
            className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
          >
            <HugeiconsIcon icon={Delete02Icon} className="size-4" />
            Revoke
          </Button>
        )}
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Revoke {token.name}?</DialogTitle>
            <DialogDescription>
              Any client using it stops working immediately. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={revoke.isPending}
              className="transition-transform duration-150 ease-out active:scale-[0.97]"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleRevoke}
              disabled={revoke.isPending}
              className="transition-transform duration-150 ease-out active:scale-[0.97]"
            >
              {revoke.isPending ? "Revoking…" : "Revoke token"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
