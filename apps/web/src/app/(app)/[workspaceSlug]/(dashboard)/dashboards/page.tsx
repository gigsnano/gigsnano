import { DashboardsDirectory } from "@/components/dashboards";

export default async function DashboardsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;

  return <DashboardsDirectory workspaceSlug={workspaceSlug} />;
}
