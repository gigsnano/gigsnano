import { AppHeader, ContentWrapper } from "@/components/layout";
import { EmptyState } from "@/components/empty-state";

export default async function ArchivesPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;

  return (
    <>
      <AppHeader />
      <ContentWrapper>
        <div className="p-6">
          <EmptyState
            assetKey="generic"
            title="No archived items"
            description="Projects, cycles, and work items you archive will be kept here so you can restore them later."
            actions={[{ label: "Browse projects", href: `/${workspaceSlug}/projects` }]}
          />
        </div>
      </ContentWrapper>
    </>
  );
}
