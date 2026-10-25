"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useUpdatePlatformUser } from "@/hooks/admin/use-admin";
import type { IPlatformUserDetail } from "@/types";

export function UserProfileEditDialog({
  user,
  open,
  onOpenChange,
}: {
  user: IPlatformUserDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [displayName, setDisplayName] = useState(user.display_name);
  const [emailDigest, setEmailDigest] = useState(user.email_digest);
  const [productUpdates, setProductUpdates] = useState(user.product_updates);
  const update = useUpdatePlatformUser();

  function handleOpenChange(next: boolean) {
    if (next) {
      setDisplayName(user.display_name);
      setEmailDigest(user.email_digest);
      setProductUpdates(user.product_updates);
    }
    onOpenChange(next);
  }

  function handleSave() {
    update.mutate(
      {
        userId: user.id,
        payload: {
          display_name: displayName.trim(),
          email_digest: emailDigest,
          product_updates: productUpdates,
        },
      },
      { onSuccess: () => onOpenChange(false) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogTitle>Edit profile</DialogTitle>
        <DialogDescription>Update account settings for {user.display_name}.</DialogDescription>

        <div className="mt-3 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Display name</span>
            <input
              className="rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={emailDigest}
              onChange={(e) => setEmailDigest(e.target.checked)}
            />
            Email digest
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={productUpdates}
              onChange={(e) => setProductUpdates(e.target.checked)}
            />
            Product updates
          </label>
        </div>

        {update.error ? (
          <p className="mt-2 text-sm text-destructive">Couldn't save changes. Try again.</p>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={update.isPending}>
            Cancel
          </Button>
          <Button
            disabled={update.isPending || !displayName.trim()}
            className="transition-transform duration-150 active:scale-[0.97]"
            onClick={handleSave}
          >
            {update.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
