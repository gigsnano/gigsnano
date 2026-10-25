import { CustomerProfile } from "@/components/intake/customers/customer-profile";

export default async function CustomerProfilePage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; customerId: string }>;
}) {
  const { workspaceSlug, customerId } = await params;

  return <CustomerProfile workspaceSlug={workspaceSlug} customerId={customerId} />;
}
