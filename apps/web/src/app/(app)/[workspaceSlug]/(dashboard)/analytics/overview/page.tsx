import { AnalyticsOverview } from "@/components/analytics/analytics-overview";

export default async function AnalyticsOverviewPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  return <AnalyticsOverview workspaceSlug={workspaceSlug} />;
}
