import { ContentWrapper } from "@/components/layout";
import { FeatureDisabledGuard } from "@/components/projects/feature-disabled-guard";
import { PagesList } from "@/components/pages/pages-list";

export default async function ProjectPagesPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; projectId: string }>;
}) {
  const { workspaceSlug, projectId } = await params;

  return (
    <ContentWrapper>
      <FeatureDisabledGuard
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        feature="pages"
      >
        <PagesList workspaceSlug={workspaceSlug} projectId={projectId} />
      </FeatureDisabledGuard>
    </ContentWrapper>
  );
}
