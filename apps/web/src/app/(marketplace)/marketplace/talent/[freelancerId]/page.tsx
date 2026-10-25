import { FreelancerProfile } from "@/components/marketplace/talent/freelancer-profile";

export default async function MarketplaceFreelancerPage({
  params,
}: {
  params: Promise<{ freelancerId: string }>;
}) {
  const { freelancerId } = await params;
  return <FreelancerProfile freelancerId={freelancerId} />;
}
