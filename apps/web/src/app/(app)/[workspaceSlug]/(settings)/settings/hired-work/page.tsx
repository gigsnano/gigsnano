import { Suspense } from "react";

import { HiredWorkPage } from "@/components/settings/workspace/hired-work-page";

export default async function HiredWorkSettingsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  return (
    <Suspense fallback={null}>
      <HiredWorkPage workspaceSlug={workspaceSlug} />
    </Suspense>
  );
}
