import { AssuranceDomainPlaceholder } from "@/components/solutions/assurance-domain-placeholder";

export default async function ContractsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; projectId: string }>;
}) {
  const { workspaceSlug, projectId } = await params;
  return (
    <AssuranceDomainPlaceholder
      title="Contracts"
      description="Contract obligations will land here once the Revenue Assurance pilot blueprint is installed."
      homeHref={`/${workspaceSlug}/projects/${projectId}`}
    />
  );
}
