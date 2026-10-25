import { CustomersList } from "@/components/intake/customers/customers-list";

export default async function CustomersPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;

  return <CustomersList workspaceSlug={workspaceSlug} />;
}
