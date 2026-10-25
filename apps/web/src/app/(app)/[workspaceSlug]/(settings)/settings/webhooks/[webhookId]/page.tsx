import { WebhookDetail } from "@/components/settings";

export default async function WebhookDetailPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; webhookId: string }>;
}) {
  const { workspaceSlug, webhookId } = await params;
  return <WebhookDetail workspaceSlug={workspaceSlug} webhookId={webhookId} />;
}
