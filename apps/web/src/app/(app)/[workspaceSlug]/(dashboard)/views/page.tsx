import { WorkspaceViewsList } from "@/components/workspace-views/workspace-views-list";

export default async function WorkspaceViewsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;

  return <WorkspaceViewsList workspaceSlug={workspaceSlug} />;
}
