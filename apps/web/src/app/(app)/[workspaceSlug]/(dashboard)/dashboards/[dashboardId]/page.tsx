import { DashboardView } from "@/components/dashboards";

export default async function DashboardDetailPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; dashboardId: string }>;
}) {
  const { workspaceSlug, dashboardId } = await params;

  return <DashboardView workspaceSlug={workspaceSlug} dashboardId={dashboardId} />;
}
