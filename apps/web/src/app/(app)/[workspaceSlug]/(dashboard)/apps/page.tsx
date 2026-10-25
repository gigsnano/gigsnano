import { AppsCatalog } from "@/components/integrations/apps-catalog";

export default async function AppsRoute({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  await params;

  return <AppsCatalog />;
}
