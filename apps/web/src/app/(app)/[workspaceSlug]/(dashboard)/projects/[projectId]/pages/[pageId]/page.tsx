import { ContentWrapper } from "@/components/layout";
import { FeatureDisabledGuard } from "@/components/projects/feature-disabled-guard";
import { PageDetail } from "@/components/pages/page-detail";

export default async function ProjectPageDetailPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; projectId: string; pageId: string }>;
}) {
  const { workspaceSlug, projectId, pageId } = await params;

  return (
    <ContentWrapper>
      <FeatureDisabledGuard
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        feature="pages"
      >
        <PageDetail workspaceSlug={workspaceSlug} projectId={projectId} pageId={pageId} />
      </FeatureDisabledGuard>
    </ContentWrapper>
  );
}
