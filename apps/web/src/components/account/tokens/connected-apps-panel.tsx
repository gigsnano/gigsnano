"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Delete02Icon } from "@hugeicons/core-free-icons";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { relativeTime } from "@/lib/format/relative-time";
import { useOAuthGrants, useRevokeOAuthGrant } from "@/hooks/oauth/use-oauth-grants";
import type { IOAuthGrant } from "@/types";

function GrantRow({ grant }: { grant: IOAuthGrant }) {
  const revoke = useRevokeOAuthGrant();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleRevoke = () => {
    revoke.mutate(grant.client_id, { onSuccess: () => setConfirmOpen(false) });
  };

  return (
    <>
      <div className="flex items-center gap-4 px-4 py-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-sm font-medium">{grant.client_name}</span>
          <span className="text-xs text-muted-foreground">
            Authorized {relativeTime(grant.authorized_at)} · scope {grant.scope}
          </span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setConfirmOpen(true)}
          aria-label={`Revoke ${grant.client_name}`}
          className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
        >
          <HugeiconsIcon icon={Delete02Icon} className="size-4" />
          Revoke
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Revoke {grant.client_name}?</DialogTitle>
            <DialogDescription>
              This app will lose access immediately. You can authorize it again from the client.
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
              {revoke.isPending ? "Revoking…" : "Revoke access"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** MCP OAuth clients the signed-in user has approved. */
export function ConnectedAppsPanel() {
  const { data, isPending, isSuccess } = useOAuthGrants();
  const hasGrants = isSuccess && data.length > 0;

  return (
    <section className="mt-10 border-t pt-10">
      <div>
        <h2 className="text-base font-semibold">Connected apps</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Apps you approved for hosted MCP access (Claude Code, Cursor, and other OAuth clients).
        </p>
      </div>

      {isPending ? (
        <div className="mt-6 space-y-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : hasGrants ? (
        <ul className="t-token-list mt-6 divide-y overflow-hidden rounded-lg border">
          {data.map((grant) => (
            <li key={grant.client_id} className="t-doc-row">
              <GrantRow grant={grant} />
            </li>
          ))}
        </ul>
      ) : isSuccess ? (
        <EmptyState
          className="mt-6"
          title="No connected apps"
          description="When you authorize an MCP client via browser login, it appears here so you can revoke access."
        />
      ) : null}
    </section>
  );
}
