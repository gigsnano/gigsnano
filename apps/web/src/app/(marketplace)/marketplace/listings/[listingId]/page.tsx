import { ListingDetail } from "@/components/marketplace/listings/listing-detail";

export default async function MarketplaceListingPage({
  params,
}: {
  params: Promise<{ listingId: string }>;
}) {
  const { listingId } = await params;
  return <ListingDetail listingId={listingId} />;
}
