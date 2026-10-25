"use client";

import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon, Mail01Icon } from "@hugeicons/core-free-icons";

import { AppHeader, ContentWrapper } from "@/components/layout";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useCustomers, useTriageQueue } from "@/hooks/intake/use-intake";
import { ETriageStatus } from "@/types";

import { WeightChip } from "./weight-chip";

const STATUS_LABEL: Record<string, string> = {
  [ETriageStatus.New]: "Awaiting triage",
  [ETriageStatus.Triaged]: "Triaged",
};

export function CustomerProfile({
  workspaceSlug,
  customerId,
}: {
  workspaceSlug: string;
  customerId: string;
}) {
  const { data: customers, isPending, isError } = useCustomers(workspaceSlug);
  const { data: triage } = useTriageQueue(workspaceSlug);

  const customer = customers?.find((c) => c.id === customerId);
  const requests = (triage ?? []).filter((t) => t.customer_id === customerId);

  return (
    <>
      <AppHeader
        actions={
          <Link
            href={`/${workspaceSlug}/customers`}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
            Customers
          </Link>
        }
      />
      <ContentWrapper className="p-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
          {isPending ? (
            <Skeleton className="h-28 rounded-2xl" />
          ) : isError || !customer ? (
            <EmptyState
              assetKey="error"
              title="Customer not found"
              description="This customer may have been removed."
              actions={[{ label: "Back to customers", href: `/${workspaceSlug}/customers` }]}
            />
          ) : (
            <>
              {/* Header card */}
              <div className="rounded-2xl border bg-card p-6">
                <div className="flex items-start gap-4">
                  <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-muted text-xl font-semibold text-muted-foreground">
                    {customer.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="text-xl font-semibold">{customer.name}</h1>
                      <WeightChip weight={customer.priority_weight} />
                    </div>
                    {customer.email ? (
                      <a
                        href={`mailto:${customer.email}`}
                        className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                      >
                        <HugeiconsIcon icon={Mail01Icon} className="size-3.5" />
                        {customer.email}
                      </a>
                    ) : null}
                    {customer.notes ? (
                      <p className="mt-3 text-sm text-muted-foreground">{customer.notes}</p>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* Open requests */}
              <section>
                <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
                  Requests ({requests.length})
                </h2>
                {requests.length === 0 ? (
                  <EmptyState
                    assetKey="generic"
                    title="No open requests"
                    description="Requests this customer raises land in the triage queue and show up here."
                    actions={[{ label: "Open triage queue", href: `/${workspaceSlug}/intake` }]}
                  />
                ) : (
                  <div className="flex flex-col gap-2">
                    {requests.map((r) => (
                      <Link
                        key={r.id}
                        href={`/${workspaceSlug}/intake`}
                        className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3.5 transition-colors hover:bg-accent/40"
                      >
                        <span className="min-w-0 truncate text-sm font-medium">
                          {r.enriched_title ?? r.title}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {STATUS_LABEL[r.status] ?? r.status}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </section>

              {/* Activity — no backend feed yet; reuse EmptyState per the ticket. */}
              <section>
                <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Activity</h2>
                <EmptyState
                  assetKey="generic"
                  title="No activity yet"
                  description="Accepted requests, status changes, and notes will appear here."
                />
              </section>
            </>
          )}
        </div>
      </ContentWrapper>
    </>
  );
}
