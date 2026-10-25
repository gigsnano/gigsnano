import { DigestSettings } from "@/components/settings";

export default async function NotificationsSettingsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  return <DigestSettings workspaceSlug={workspaceSlug} />;
}
