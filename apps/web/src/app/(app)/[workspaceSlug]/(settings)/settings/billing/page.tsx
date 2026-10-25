import { Suspense } from "react";

import { WalletPage } from "@/components/settings";
import { PlanComparison } from "@/components/billing/plan/plan-comparison";
import { EntitlementsOverview } from "@/components/billing/entitlement";

export default async function BillingSettingsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  return (
    <div className="pb-10">
      <section className="max-w-5xl px-10 py-8">
        <PlanComparison workspaceSlug={workspaceSlug} />
      </section>

      <div className="border-t border-border/60" />

      <EntitlementsOverview workspaceSlug={workspaceSlug} />

      <div className="border-t border-border/60" />

      <Suspense fallback={null}>
        <WalletPage workspaceSlug={workspaceSlug} />
      </Suspense>
    </div>
  );
}
