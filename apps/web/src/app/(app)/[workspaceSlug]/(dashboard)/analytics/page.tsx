import { redirect } from "next/navigation";

export default async function AnalyticsIndexPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  redirect(`/${workspaceSlug}/analytics/overview`);
}
