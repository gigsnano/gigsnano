import { ExportsSettings } from "@/components/settings";

export default async function ExportsSettingsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  return <ExportsSettings workspaceSlug={workspaceSlug} />;
}
