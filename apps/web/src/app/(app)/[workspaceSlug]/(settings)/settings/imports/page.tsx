import { ImportSettings } from "@/components/settings";

export default async function ImportsSettingsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  return <ImportSettings workspaceSlug={workspaceSlug} />;
}
