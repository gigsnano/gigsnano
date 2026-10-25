import { TimeReports } from "@/components/time/time-reports";

export default async function TimeReportsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;

  return <TimeReports workspaceSlug={workspaceSlug} />;
}
