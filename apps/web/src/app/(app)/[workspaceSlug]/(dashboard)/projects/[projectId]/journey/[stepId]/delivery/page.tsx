import { DeliveryReview } from "@/components/journey/delivery/delivery-review";

export default async function ProjectDeliveryPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; projectId: string; stepId: string }>;
}) {
  const { workspaceSlug, projectId, stepId } = await params;

  return <DeliveryReview workspaceSlug={workspaceSlug} projectId={projectId} stepId={stepId} />;
}
