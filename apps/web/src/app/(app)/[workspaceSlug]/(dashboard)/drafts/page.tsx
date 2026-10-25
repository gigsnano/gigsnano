import { AppHeader, ContentWrapper } from "@/components/layout";
import { DraftsList } from "@/components/drafts/drafts-list";

export default async function DraftsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;

  return (
    <>
      <AppHeader />
      <ContentWrapper>
        <DraftsList workspaceSlug={workspaceSlug} />
      </ContentWrapper>
    </>
  );
}
