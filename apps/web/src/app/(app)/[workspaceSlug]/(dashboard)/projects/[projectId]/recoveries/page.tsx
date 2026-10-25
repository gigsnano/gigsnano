import { AssuranceDomainPlaceholder } from "@/components/solutions/assurance-domain-placeholder";

export default async function RecoveriesPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; projectId: string }>;
}) {
  const { workspaceSlug, projectId } = await params;
  return (
    <AssuranceDomainPlaceholder
      title="Recoveries"
      description="Recovery actions against open exceptions will be managed here."
      homeHref={`/${workspaceSlug}/projects/${projectId}`}
    />
  );
}
