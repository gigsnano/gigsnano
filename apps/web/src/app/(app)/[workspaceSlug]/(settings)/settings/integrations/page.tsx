import { IntegrationsSettings } from "@/components/settings";

export default async function IntegrationsSettingsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  return <IntegrationsSettings workspaceSlug={workspaceSlug} />;
}
