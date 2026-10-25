import { BoardRedirect } from "@/components/board";

export default async function ProjectBoardPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; projectId: string }>;
}) {
  const { workspaceSlug, projectId } = await params;

  return <BoardRedirect workspaceSlug={workspaceSlug} projectId={projectId} />;
}
