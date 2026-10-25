import { AssuranceDomainPlaceholder } from "@/components/solutions/assurance-domain-placeholder";

export default async function AuditPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; projectId: string }>;
}) {
  const { workspaceSlug, projectId } = await params;
  return (
    <AssuranceDomainPlaceholder
      title="Audit"
      description="An immutable trail of assurance decisions and retrievals will appear here."
      homeHref={`/${workspaceSlug}/projects/${projectId}`}
    />
  );
}
