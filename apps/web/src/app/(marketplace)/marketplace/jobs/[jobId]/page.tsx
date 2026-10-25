import { JobDetail } from "@/components/marketplace/jobs/job-detail";

export default async function MarketplaceJobDetailPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  return <JobDetail jobId={jobId} />;
}
