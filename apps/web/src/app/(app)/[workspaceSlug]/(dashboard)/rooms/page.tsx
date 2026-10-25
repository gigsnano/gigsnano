import { AppHeader, ContentWrapper } from "@/components/layout";
import { RoomsList } from "@/components/rooms/rooms-list";

export default async function RoomsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;

  return (
    <>
      <AppHeader />
      <ContentWrapper>
        <RoomsList key={workspaceSlug} workspaceSlug={workspaceSlug} />
      </ContentWrapper>
    </>
  );
}
