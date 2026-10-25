"use client";

import { useMutation } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useConnectStatus } from "@/hooks/billing/use-wallet";
import { walletService } from "@/services/billing/wallet.service";
import { EConnectStatus } from "@/types";
import { cn } from "@/lib/utils";

export function ConnectOnboardingCard() {
  const { data: connect, isPending, refetch } = useConnectStatus();
  const onboard = useMutation({
    mutationFn: () => walletService.createConnectOnboarding(),
    onSuccess: (res) => {
      window.location.href = res.url;
    },
  });

  if (isPending) {
    return <Skeleton className="h-24 rounded-lg" />;
  }

  const active = connect?.payouts_enabled && connect.status === EConnectStatus.Active;

  return (
    <div
      className={cn(
        "rounded-lg border p-5 transition-colors",
        active ? "border-emerald-500/30 bg-emerald-500/5" : "border-border",
      )}
    >
      {active ? (
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-emerald-500" aria-hidden />
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
            Payouts enabled
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Set up Stripe Connect to receive payments from completed marketplace work.
          </p>
          <Button
            size="sm"
            className="mt-3 transition-transform duration-150 ease-out active:scale-[0.97]"
            disabled={onboard.isPending}
            onClick={() => onboard.mutate()}
          >
            {onboard.isPending ? "Opening…" : "Set up payouts"}
          </Button>
        </>
      )}
      {onboard.isError ? (
        <button
          type="button"
          className="mt-2 text-xs text-muted-foreground underline underline-offset-2"
          onClick={() => void refetch()}
        >
          Couldn&apos;t load status — retry
        </button>
      ) : null}
    </div>
  );
}
