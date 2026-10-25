"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePlanPrices, useSetPlanPrice } from "@/hooks/admin/use-admin";
import { PLAN_TIERS } from "@/constants/plans";
import { APIError } from "@/services/api-error";
import type { IPlanPrice } from "@/types";

const TIERS = ["pro", "business"] as const;
const INTERVALS = [
  { key: "monthly", label: "Monthly" },
  { key: "annual", label: "Annual" },
] as const;

const money = (cents: number) => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

export function PlanPricesGrid() {
  const { data: prices, isPending, isError } = usePlanPrices();
  const [editing, setEditing] = useState<{ tier: string; interval: string } | null>(null);

  const byKey = new Map((prices ?? []).map((p) => [`${p.tier}_${p.interval}`, p]));
  const current = editing ? byKey.get(`${editing.tier}_${editing.interval}`) : undefined;

  return (
    <section className="rounded-xl border bg-card p-5">
      <h2 className="text-sm font-semibold">Stripe plan prices</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Set the monthly and annual price for each paid tier. Saving creates the Stripe
        product/price and stores it — self-serve checkout uses these.
      </p>

      {isPending ? (
        <div className="mt-4 h-32 animate-pulse rounded-lg bg-muted" />
      ) : isError ? (
        <p className="mt-4 text-sm text-destructive">Couldn&apos;t load plan prices.</p>
      ) : (
        <div className="mt-4 overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-4 py-2 font-medium">Tier</th>
                {INTERVALS.map((i) => (
                  <th key={i.key} className="px-4 py-2 font-medium">
                    {i.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {TIERS.map((tier) => (
                <tr key={tier}>
                  <td className="px-4 py-3 font-medium">
                    {PLAN_TIERS[tier as keyof typeof PLAN_TIERS]?.name ?? tier}
                  </td>
                  {INTERVALS.map((i) => {
                    const p = byKey.get(`${tier}_${i.key}`);
                    return (
                      <td key={i.key} className="px-4 py-3">
                        <PriceCell price={p} onEdit={() => setEditing({ tier, interval: i.key })} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <SetPriceDialog
        editing={editing}
        current={current}
        onClose={() => setEditing(null)}
      />
    </section>
  );
}

function PriceCell({ price, onEdit }: { price?: IPlanPrice; onEdit: () => void }) {
  return (
    <div className="flex items-center gap-2">
      {price?.configured ? (
        <span className="font-medium tabular-nums">{money(price.unit_amount_cents)}</span>
      ) : (
        <span className="text-xs text-muted-foreground">Not set</span>
      )}
      <Button type="button" size="xs" variant="ghost" onClick={onEdit}>
        {price?.configured ? "Edit" : "Set price"}
      </Button>
    </div>
  );
}

function SetPriceDialog({
  editing,
  current,
  onClose,
}: {
  editing: { tier: string; interval: string } | null;
  current?: IPlanPrice;
  onClose: () => void;
}) {
  return (
    <Dialog open={editing !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        {editing ? (
          <SetPriceForm
            key={`${editing.tier}_${editing.interval}`}
            tier={editing.tier}
            interval={editing.interval}
            current={current}
            onDone={onClose}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function SetPriceForm({
  tier,
  interval,
  current,
  onDone,
}: {
  tier: string;
  interval: string;
  current?: IPlanPrice;
  onDone: () => void;
}) {
  const setPrice = useSetPlanPrice();
  // Dollars in the input; convert to cents on submit. Seed from the current price.
  const [dollars, setDollars] = useState(
    current?.configured ? String(current.unit_amount_cents / 100) : "",
  );

  const tierName = PLAN_TIERS[tier as keyof typeof PLAN_TIERS]?.name ?? tier;
  const errorMsg =
    setPrice.error instanceof APIError
      ? setPrice.error.status === 503
        ? "Stripe isn't configured (no write-capable key)."
        : "Couldn't create the price — check the amount and try again."
      : setPrice.error
        ? "Couldn't create the price — please try again."
        : null;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Math.round(parseFloat(dollars) * 100);
    if (!Number.isFinite(amount) || amount <= 0) return;
    setPrice.mutate(
      { tier, interval, payload: { amount_cents: amount } },
      { onSuccess: () => onDone() },
    );
  };

  return (
    <form onSubmit={onSubmit}>
      <DialogTitle>
        {tierName} · {interval === "annual" ? "Annual" : "Monthly"} price
      </DialogTitle>
      <DialogDescription className="mt-1">
        Per seat, in USD. Saving creates a new Stripe price (the old one is archived).
      </DialogDescription>

      <div className="mt-4 flex flex-col gap-1.5">
        <Label htmlFor="price-amount">Amount (USD)</Label>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">$</span>
          <input
            id="price-amount"
            type="number"
            min="0"
            step="0.01"
            value={dollars}
            onChange={(e) => setDollars(e.target.value)}
            placeholder="8"
            className="w-32 rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          <span className="text-sm text-muted-foreground">
            / seat / {interval === "annual" ? "year" : "month"}
          </span>
        </div>
      </div>

      {errorMsg ? <p className="mt-3 text-sm text-destructive">{errorMsg}</p> : null}

      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={setPrice.isPending || !dollars.trim()}>
          {setPrice.isPending ? "Saving…" : "Save price"}
        </Button>
      </div>
    </form>
  );
}
