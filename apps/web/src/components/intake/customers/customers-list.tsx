"use client";

import { useState } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";

import { AppHeader, ContentWrapper } from "@/components/layout";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useCreateCustomer, useCustomers, useTriageQueue } from "@/hooks/intake/use-intake";
import { ETriageStatus } from "@/types";

import { WEIGHT_META } from "./customer-weight";
import { WeightChip } from "./weight-chip";

export function CustomersList({ workspaceSlug }: { workspaceSlug: string }) {
  const { data, isPending, isError, refetch } = useCustomers(workspaceSlug);
  const { data: triage } = useTriageQueue(workspaceSlug);
  const create = useCreateCustomer(workspaceSlug);
  const [composing, setComposing] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [weight, setWeight] = useState(0);

  const customers = data ?? [];
  const openRequests = (customerId: string) =>
    (triage ?? []).filter(
      (t) => t.customer_id === customerId && t.status !== ETriageStatus.Accepted,
    ).length;

  const submit = () => {
    if (!name.trim()) return;
    create.mutate(
      { name: name.trim(), email: email.trim() || null, priority_weight: weight },
      {
        onSuccess: () => {
          setName("");
          setEmail("");
          setWeight(0);
          setComposing(false);
        },
      },
    );
  };

  return (
    <>
      <AppHeader
        actions={
          <Button size="sm" onClick={() => setComposing((v) => !v)}>
            <HugeiconsIcon icon={Add01Icon} className="size-4" />
            Add customer
          </Button>
        }
      />
      <ContentWrapper className="p-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
          {composing ? (
            <div className="rounded-xl border bg-card p-4">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Customer name"
                  aria-label="Customer name"
                />
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@company.com"
                  aria-label="Customer email"
                  type="email"
                />
              </div>
              <div className="mt-3 flex items-center gap-1.5">
                <span className="mr-1 text-xs text-muted-foreground">Weight</span>
                {[0, 1, 2, 3].map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setWeight(w)}
                    className={
                      "rounded-full border px-2 py-0.5 text-xs font-medium transition-colors " +
                      (weight === w
                        ? WEIGHT_META[w].chip
                        : "border-border text-muted-foreground hover:text-foreground")
                    }
                  >
                    {WEIGHT_META[w].label}
                  </button>
                ))}
                <div className="ml-auto flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setComposing(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={submit} disabled={!name.trim() || create.isPending}>
                    {create.isPending ? "Adding…" : "Add"}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {isPending ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-xl" />
              ))}
            </div>
          ) : isError ? (
            <EmptyState
              assetKey="error"
              title="Couldn't load customers"
              description="Something went wrong fetching your customer list."
              actions={[{ label: "Retry", onClick: () => refetch() }]}
            />
          ) : customers.length === 0 ? (
            <EmptyState
              assetKey="generic"
              title="No customers yet"
              description="Add the clients you support to weight their requests and track everything they raise in one place."
              actions={[{ label: "Add customer", onClick: () => setComposing(true) }]}
            />
          ) : (
            customers.map((c) => (
              <Link
                key={c.id}
                href={`/${workspaceSlug}/customers/${c.id}`}
                className="group flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-accent/40"
              >
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground">
                  {c.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{c.name}</span>
                    <WeightChip weight={c.priority_weight} />
                  </div>
                  <p className="truncate text-sm text-muted-foreground">
                    {c.email ?? "No email"} · {openRequests(c.id)} open request
                    {openRequests(c.id) === 1 ? "" : "s"}
                  </p>
                </div>
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                />
              </Link>
            ))
          )}
        </div>
      </ContentWrapper>
    </>
  );
}
