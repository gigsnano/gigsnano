"use client";

import { EmptyState } from "@/components/empty-state";

/**
 * Placeholder for Revenue Assurance domain surfaces (GIN-447).
 *
 * Navigation and route guards ship before the domain objects (contracts,
 * exceptions, …) do — this page is what a deep link lands on until GIN-472's
 * pilot blueprint fills the real UI. It says so plainly rather than rendering
 * an empty software project view.
 */
export function AssuranceDomainPlaceholder({
  title,
  description,
  homeHref,
}: {
  title: string;
  description: string;
  homeHref: string;
}) {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <EmptyState
        assetKey="generic"
        title={title}
        description={description}
        actions={[{ label: "Back to Assurance Home", href: homeHref }]}
      />
    </div>
  );
}
