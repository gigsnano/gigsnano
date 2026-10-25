import { CodebaseIntelligence } from "@/components/codebase/intelligence/codebase-intelligence";

export default async function ProjectCodebasePage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; projectId: string }>;
}) {
  const { workspaceSlug, projectId } = await params;

  return <CodebaseIntelligence workspaceSlug={workspaceSlug} projectId={projectId} />;
}
