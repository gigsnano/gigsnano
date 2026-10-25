import { StickiesBoard } from "@/components/stickies/stickies-board";

export default async function StickiesPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;

  return <StickiesBoard workspaceSlug={workspaceSlug} />;
}
