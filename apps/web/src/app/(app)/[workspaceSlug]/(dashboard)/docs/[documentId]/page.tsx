import { AppHeader, ContentWrapper } from "@/components/layout";
import { DocumentDetail } from "@/components/docs/document-detail";

export default async function DocDetailPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; documentId: string }>;
}) {
  const { workspaceSlug, documentId } = await params;

  return (
    <>
      <AppHeader />
      <ContentWrapper>
        <DocumentDetail workspaceSlug={workspaceSlug} documentId={documentId} />
      </ContentWrapper>
    </>
  );
}
