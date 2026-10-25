import { JobsSearchPage } from "@/components/marketplace/jobs/jobs-search-page";

export default async function MarketplaceJobsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  return <JobsSearchPage q={q ?? ""} />;
}
