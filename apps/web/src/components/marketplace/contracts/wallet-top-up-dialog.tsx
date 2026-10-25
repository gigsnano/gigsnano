"use client";

import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTopup } from "@/hooks/billing/use-wallet";
import { queryKeys } from "@/hooks/query-keys";
import { formatCents } from "@/lib/format/money";
import { cn } from "@/lib/utils";

const TOPUP_PRESETS = [5000, 10000, 25000] as const;

/** Inline top-up when accept-bid fails with 402 insufficient balance. */
export function WalletTopUpDialog({
  workspaceSlug,
  open,
  onOpenChange,
  onToppedUp,
}: {
  workspaceSlug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToppedUp?: () => void;
}) {
  const [amount, setAmount] = useState<number>(10000);
  const topup = useTopup(workspaceSlug);
  const queryClient = useQueryClient();

  const onTopup = async () => {
    await topup.mutateAsync(amount);
    await queryClient.refetchQueries({ queryKey: queryKeys.wallet(workspaceSlug) });
    onOpenChange(false);
    onToppedUp?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Top up wallet</DialogTitle>
        <DialogDescription>
          Accepting this bid requires enough available balance for the bid plus platform fee. Add credits
          below, then try Accept again.
        </DialogDescription>
        <div className="mt-4 flex flex-wrap gap-2">
          {TOPUP_PRESETS.map((cents) => (
            <button
              key={cents}
              type="button"
              onClick={() => setAmount(cents)}
              className={cn(
                "rounded-md border px-3 py-1.5 text-sm font-medium tabular-nums transition-colors",
                amount === cents
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border hover:bg-accent/50",
              )}
            >
              {formatCents(cents)}
            </button>
          ))}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={topup.isPending} onClick={() => void onTopup()}>
            {topup.isPending ? "Processing…" : `Top up ${formatCents(amount)}`}
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Or manage billing in{" "}
          <Link href={`/${workspaceSlug}/settings/billing`} className="text-primary underline">
            Wallet settings
          </Link>
          .
        </p>
      </DialogContent>
    </Dialog>
  );
}
