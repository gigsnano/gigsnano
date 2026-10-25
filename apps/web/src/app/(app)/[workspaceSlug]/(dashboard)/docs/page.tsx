import { MobileHeader } from "@/components/layout/mobile-header";
import { DocumentsPage } from "@/components/docs/documents-page";

export default async function DocsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;

  return (
    <>
      <MobileHeader backHref={`/${workspaceSlug}`} title="Docs" className="md:hidden" />
      <DocumentsPage workspaceSlug={workspaceSlug} />
    </>
  );
}
