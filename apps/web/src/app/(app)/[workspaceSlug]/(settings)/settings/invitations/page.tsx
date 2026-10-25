import { WorkspaceInvitationsList } from "@/components/settings";

export default async function InvitationsSettingsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  return <WorkspaceInvitationsList workspaceSlug={workspaceSlug} />;
}
