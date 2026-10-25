import { AnalyticsActiveCycles } from "@/components/analytics/analytics-active-cycles";

export default async function AnalyticsActiveCyclesPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  return <AnalyticsActiveCycles workspaceSlug={workspaceSlug} />;
}
