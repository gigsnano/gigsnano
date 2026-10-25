"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useUpdateUserSuspension } from "@/hooks/admin/use-admin";
import type { IPlatformUser } from "@/types";

export function SuspendUserDialog({
  user,
  open,
  onOpenChange,
  onSuccess,
}: {
  user: IPlatformUser;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}) {
  const [reason, setReason] = useState("");
  const update = useUpdateUserSuspension();
  const suspending = !user.is_suspended;

  function handleOpenChange(next: boolean) {
    if (!next) setReason("");
    onOpenChange(next);
  }

  function handleConfirm() {
    update.mutate(
      {
        userId: user.id,
        payload: {
          is_suspended: suspending,
          reason: reason.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          setReason("");
          onOpenChange(false);
          onSuccess?.();
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogTitle>
          {suspending ? `Suspend ${user.display_name}?` : `Reinstate ${user.display_name}?`}
        </DialogTitle>
        <DialogDescription>
          {suspending
            ? "They won't be able to sign in until reinstated."
            : "They'll regain access to the platform immediately."}
        </DialogDescription>

        {suspending ? (
          <label className="mt-2 flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Reason (optional)</span>
            <textarea
              rows={3}
              className="rounded-md border border-border bg-background px-2.5 py-2 text-sm text-foreground"
              placeholder="Policy violation, abuse report…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
        ) : null}

        {update.error ? (
          <p className="text-sm text-destructive">Couldn't update this user. Try again.</p>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={update.isPending}>
            Cancel
          </Button>
          <Button
            variant={suspending ? "destructive" : "default"}
            disabled={update.isPending}
            className="transition-transform duration-150 active:scale-[0.97]"
            onClick={handleConfirm}
          >
            {update.isPending
              ? "Saving…"
              : suspending
                ? "Suspend user"
                : "Reinstate user"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
