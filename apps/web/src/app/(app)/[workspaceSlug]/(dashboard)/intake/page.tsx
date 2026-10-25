import { IntakeQueue } from "@/components/intake/intake-queue";

export default async function IntakePage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;

  return <IntakeQueue workspaceSlug={workspaceSlug} />;
}
