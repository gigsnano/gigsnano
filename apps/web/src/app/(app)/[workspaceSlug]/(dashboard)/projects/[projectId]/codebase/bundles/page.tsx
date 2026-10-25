import { CodebaseTabs } from "@/components/codebase/system/codebase-tabs";
import { BundlesScreen } from "@/components/codebase/system/bundles/bundles-screen";

export default async function ProjectBundlesPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; projectId: string }>;
}) {
  const { workspaceSlug, projectId } = await params;
  return (
    <div className="flex h-full flex-col gap-4 p-6 pt-4">
      <CodebaseTabs workspaceSlug={workspaceSlug} projectId={projectId} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <BundlesScreen workspaceSlug={workspaceSlug} projectId={projectId} />
      </div>
    </div>
  );
}
