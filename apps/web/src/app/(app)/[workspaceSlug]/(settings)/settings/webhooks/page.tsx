import { WebhooksSettings } from "@/components/settings";
import { FeatureGate } from "@/components/billing/gates";
import { EEntitlementFeature } from "@/constants/plans";

export default async function WebhooksSettingsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  return (
    <FeatureGate
      feature={EEntitlementFeature.Webhooks}
      nudgeTitle="Webhooks are a Business feature"
      nudgeDescription="Upgrade to Business to create and manage webhooks."
    >
      <WebhooksSettings workspaceSlug={workspaceSlug} />
    </FeatureGate>
  );
}
