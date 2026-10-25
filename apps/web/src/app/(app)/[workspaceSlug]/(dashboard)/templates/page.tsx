import { TemplatesGallery } from "@/components/templates/templates-gallery";

export default async function TemplatesRoute({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;

  return <TemplatesGallery workspaceSlug={workspaceSlug} />;
}
