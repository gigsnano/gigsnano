import { GeneralSettingsForm } from "@/components/settings";

export default async function GeneralSettingsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  return <GeneralSettingsForm workspaceSlug={workspaceSlug} />;
}
