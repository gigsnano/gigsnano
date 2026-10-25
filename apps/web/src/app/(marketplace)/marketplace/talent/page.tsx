import { TalentSearchPage } from "@/components/marketplace/talent/talent-search-page";

export default async function MarketplaceTalentPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  return <TalentSearchPage q={q ?? ""} />;
}
