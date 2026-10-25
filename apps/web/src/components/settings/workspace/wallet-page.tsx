"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import { ConnectOnboardingCard } from "@/components/billing/connect-onboarding-card";
import { UsageDashboard } from "@/components/billing/usage/usage-dashboard";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useTopup, useWallet, useWalletTransactions } from "@/hooks/billing/use-wallet";
import { useWorkspaceRole } from "@/hooks/workspace/use-workspace-role";
import { queryKeys } from "@/hooks/query-keys";
import { formatCents } from "@/lib/format/money";
import { cn } from "@/lib/utils";

const TOPUP_PRESETS = [2500, 5000, 10000] as const;

function txnTypeLabel(type: string): string {
  switch (type) {
    case "topup": return "Top-up";
    case "debit": return "AI usage";
    case "hold": return "Escrow hold";
    case "release": return "Escrow release";
    case "capture": return "Escrow capture";
    case "fee": return "Platform fee";
    default: return type;
  }
}

function BalanceTile({
  label,
  cents,
  emphasis,
}: {
  label: string;
  cents: number;
  emphasis?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-4 transition-colors",
        emphasis && "border-primary/30 bg-primary/5",
      )}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tabular-nums", emphasis && "text-primary")}>
        {formatCents(cents)}
      </p>
    </div>
  );
}

export function WalletPage({ workspaceSlug }: { workspaceSlug: string }) {
  const params = useSearchParams();
  const topupState = params.get("topup"); // "success" | "cancelled" | null
  const qc = useQueryClient();
  const { isAdmin } = useWorkspaceRole(workspaceSlug);
  const { data: wallet, isPending, isError, refetch } = useWallet(workspaceSlug);
  const { data: txns, isPending: txnsPending } = useWalletTransactions(workspaceSlug);
  const topup = useTopup(workspaceSlug);
  const [selectedAmount, setSelectedAmount] = useState<number>(TOPUP_PRESETS[1]);

  useEffect(() => {
    if (topupState === "success") {
      qc.invalidateQueries({ queryKey: queryKeys.wallet(workspaceSlug) });
      qc.invalidateQueries({ queryKey: queryKeys.walletTransactions(workspaceSlug) });
    }
  }, [topupState, workspaceSlug, qc]);

  const onTopup = async () => {
    const result = await topup.mutateAsync(selectedAmount);
    if (result.checkout_url) {
      window.location.href = result.checkout_url;
    }
  };

  if (isPending) {
    return (
      <div className="max-w-2xl px-10 py-8">
        <Skeleton className="h-6 w-28" />
        <Skeleton className="mt-2 h-4 w-72" />
        <div className="mt-6 grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
        <Skeleton className="mt-6 h-10 w-32" />
        <section className="mt-8 rounded-lg border">
          <div className="border-b px-5 py-3">
            <Skeleton className="h-3 w-28" />
          </div>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex justify-between gap-4 px-5 py-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </section>
      </div>
    );
  }

  if (isError || !wallet) {
    return (
      <div className="p-8">
        <EmptyState
          assetKey="error"
          title="Couldn't load wallet"
          description="Something went wrong fetching your workspace balance."
          actions={[{ label: "Retry", onClick: () => refetch() }]}
        />
      </div>
    );
  }

  const total = wallet.available_cents + wallet.held_cents;

  return (
    <div className="max-w-2xl px-10 py-8">
      <h1 className="text-lg font-semibold">Wallet</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Prepaid credits fund AI agent usage and marketplace escrow. Held funds are locked until contracts settle.
      </p>

      <div className="mt-6 grid grid-cols-3 gap-3">
        <BalanceTile label="Available" cents={wallet.available_cents} emphasis />
        <BalanceTile label="Held" cents={wallet.held_cents} />
        <BalanceTile label="Total" cents={total} />
      </div>

      {/* Top-up is `require_role(ADMIN, OWNER)` server-side. A member can read
          the balance but can't add to it, so the whole section is hidden rather
          than shown with a button that 403s. */}
      {!isAdmin ? null : (
      <section className="mt-6 rounded-lg border p-5">
        <h2 className="text-sm font-semibold">Top up</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Add credits to your workspace wallet. Minimum preset amounts below.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {TOPUP_PRESETS.map((cents) => (
            <button
              key={cents}
              type="button"
              onClick={() => setSelectedAmount(cents)}
              className={cn(
                "rounded-md border px-3 py-1.5 text-sm font-medium tabular-nums transition-[transform,background-color,border-color] duration-150 ease-out active:scale-[0.97]",
                selectedAmount === cents
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background text-foreground hover:bg-accent/50",
              )}
            >
              {formatCents(cents)}
            </button>
          ))}
        </div>
        <Button
          size="sm"
          className="mt-4 transition-transform duration-150 ease-out active:scale-[0.97]"
          disabled={topup.isPending}
          onClick={() => void onTopup()}
        >
          {topup.isPending ? "Processing…" : `Top up ${formatCents(selectedAmount)}`}
        </Button>
        {topupState === "success" ? (
          <p className="mt-2 text-xs font-medium text-primary">Top-up complete.</p>
        ) : null}
        {topupState === "cancelled" ? (
          <p className="mt-2 text-xs text-muted-foreground">Top-up cancelled.</p>
        ) : null}
        {topup.isError ? (
          <p className="mt-2 text-xs text-destructive">Top-up failed — try again.</p>
        ) : null}
      </section>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-semibold">AI usage</h2>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">
          What your workspace has spent on AI agents and generations.
        </p>
        <UsageDashboard workspaceSlug={workspaceSlug} />
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold">Freelancer payouts</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect a Stripe Express account to receive marketplace earnings.
        </p>
        <div className="mt-3">
          <ConnectOnboardingCard />
        </div>
      </section>

      <section className="mt-8 rounded-lg border">
        <div className="border-b px-5 py-3">
          <h2 className="text-sm font-semibold">Transaction history</h2>
        </div>
        {txnsPending ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        ) : !txns?.length ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">No transactions yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="px-5 pb-2 pt-3 font-medium">Type</th>
                <th className="px-5 pb-2 pt-3 font-medium">Amount</th>
                <th className="px-5 pb-2 pt-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {txns.map((t) => (
                <tr key={t.id}>
                  <td className="px-5 py-2.5">{txnTypeLabel(t.type)}</td>
                  <td className="px-5 py-2.5 tabular-nums">{formatCents(t.amount_cents)}</td>
                  <td className="px-5 py-2.5 text-muted-foreground">
                    {new Date(t.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
