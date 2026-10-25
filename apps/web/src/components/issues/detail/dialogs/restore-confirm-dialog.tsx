"use client";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/** Confirms restoring a work-item field to a prior value from history. Overwrites
 * the current value; a new history entry records the restore. */
export function RestoreConfirmDialog({
  open,
  fieldLabel,
  pending,
  onConfirm,
  onOpenChange,
}: {
  open: boolean;
  fieldLabel: string;
  pending: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const label = fieldLabel.replace(/_/g, " ");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Restore {label}?</DialogTitle>
        <DialogDescription>
          This overwrites the current {label} with the value from this history entry.
          You can restore again afterwards — the change is logged.
        </DialogDescription>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={pending}
            className="transition-transform duration-150 active:scale-[0.97]"
          >
            {pending ? "Restoring…" : "Restore"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
