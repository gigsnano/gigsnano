import { AppHeader, ContentWrapper } from "@/components/layout";
import { TrashList } from "@/components/trash/trash-list";

export default async function TrashPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;

  return (
    <>
      <AppHeader />
      <ContentWrapper>
        <TrashList workspaceSlug={workspaceSlug} />
      </ContentWrapper>
    </>
  );
}
