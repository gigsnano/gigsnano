import { AppHeader, ContentWrapper } from "@/components/layout";
import { WorkspaceHome } from "@/components/workspace/workspace-home";

export default async function WorkspaceHomePage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;

  return (
    <>
      <AppHeader />
      <ContentWrapper>
        <WorkspaceHome workspaceSlug={workspaceSlug} />
      </ContentWrapper>
    </>
  );
}
