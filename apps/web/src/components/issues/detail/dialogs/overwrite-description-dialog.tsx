"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/** Confirms replacing an existing task description with the agent's distilled draft. */
export function OverwriteDescriptionDialog({
  open,
  agentName,
  pending,
  onConfirm,
  onOpenChange,
}: {
  open: boolean;
  agentName: string;
  pending: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Replace the description?</DialogTitle>
        <DialogDescription>
          {agentName} will replace this task&apos;s current description with a version
          distilled from your conversation. You can still edit it afterwards.
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
            {pending ? "Generating…" : "Replace description"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
