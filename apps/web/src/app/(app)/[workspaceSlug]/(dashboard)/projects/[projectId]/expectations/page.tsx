import { AssuranceDomainPlaceholder } from "@/components/solutions/assurance-domain-placeholder";

export default async function ExpectationsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; projectId: string }>;
}) {
  const { workspaceSlug, projectId } = await params;
  return (
    <AssuranceDomainPlaceholder
      title="Billing Expectations"
      description="Expected invoices derived from contract obligations will show up here."
      homeHref={`/${workspaceSlug}/projects/${projectId}`}
    />
  );
}
