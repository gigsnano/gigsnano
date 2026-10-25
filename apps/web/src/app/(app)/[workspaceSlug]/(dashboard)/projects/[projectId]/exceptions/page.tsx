import { AssuranceDomainPlaceholder } from "@/components/solutions/assurance-domain-placeholder";

export default async function ExceptionsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; projectId: string }>;
}) {
  const { workspaceSlug, projectId } = await params;
  return (
    <AssuranceDomainPlaceholder
      title="Exceptions"
      description="Missing, rejected and short-paid invoices will be tracked here."
      homeHref={`/${workspaceSlug}/projects/${projectId}`}
    />
  );
}
