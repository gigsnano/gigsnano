import { AssuranceDomainPlaceholder } from "@/components/solutions/assurance-domain-placeholder";

export default async function EvidencePage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; projectId: string }>;
}) {
  const { workspaceSlug, projectId } = await params;
  return (
    <AssuranceDomainPlaceholder
      title="Evidence"
      description="Permission-trimmed mailbox and document evidence will surface here with citations."
      homeHref={`/${workspaceSlug}/projects/${projectId}`}
    />
  );
}
