import { ContractDetailPage } from "@/components/marketplace/contracts/contract-detail";

export default async function Page({
  params,
}: {
  params: Promise<{ contractId: string }>;
}) {
  const { contractId } = await params;
  return <ContractDetailPage contractId={contractId} />;
}
