import { GigsAiFull } from "@/components/ai/gigs-ai-full";

export default async function GigsAiPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{ q?: string; thread?: string }>;
}) {
  const { workspaceSlug } = await params;
  const { q, thread } = await searchParams;
  return (
    <GigsAiFull
      key={`${workspaceSlug}:${thread ?? "new"}`}
      workspaceSlug={workspaceSlug}
      initialPrompt={q}
      initialThreadId={thread}
    />
  );
}
