import { AssuranceDomainPlaceholder } from "@/components/solutions/assurance-domain-placeholder";

export default async function ControlsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; projectId: string }>;
}) {
  const { workspaceSlug, projectId } = await params;
  return (
    <AssuranceDomainPlaceholder
      title="Controls"
      description="The four deterministic revenue-assurance controls will be configured here."
      homeHref={`/${workspaceSlug}/projects/${projectId}`}
    />
  );
}
