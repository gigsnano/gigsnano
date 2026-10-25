import { AppHeader, ContentWrapper } from "@/components/layout";
import { YourWorkHub } from "@/components/issues/your-work/your-work-hub";

export default async function WorkspaceWorkItemsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;

  return (
    <>
      <AppHeader />
      <ContentWrapper>
        <YourWorkHub workspaceSlug={workspaceSlug} />
      </ContentWrapper>
    </>
  );
}
