import { AppHeader, ContentWrapper } from "@/components/layout";
import { UserProfileCard } from "@/components/profile/user-profile-card";

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; userId: string }>;
}) {
  const { workspaceSlug, userId } = await params;

  return (
    <>
      <AppHeader />
      <ContentWrapper>
        <div className="p-6">
          <UserProfileCard workspaceSlug={workspaceSlug} userId={userId} />
        </div>
      </ContentWrapper>
    </>
  );
}
