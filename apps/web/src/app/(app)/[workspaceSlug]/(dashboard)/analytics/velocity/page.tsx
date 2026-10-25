import { AnalyticsVelocity } from "@/components/analytics/analytics-velocity";

export default async function AnalyticsVelocityPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  return <AnalyticsVelocity workspaceSlug={workspaceSlug} />;
}
